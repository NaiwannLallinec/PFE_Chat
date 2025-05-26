# main.py
import os
import httpx
from typing import List
from typing import Optional
from datetime import datetime
from datetime import datetime, timedelta
from typing import List, Generator
from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel, constr

from sqlalchemy import Column, Integer, String, TIMESTAMP, text, create_engine, Boolean

from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from passlib.context import CryptContext
from dotenv import load_dotenv

from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    status,
    APIRouter,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel, constr, Field
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    TIMESTAMP,
    text,
    create_engine,
)
from sqlalchemy.orm import (
    declarative_base,
    sessionmaker,
    Session,
)

# -------------------------------------------------------------------------
# ENV & CONFIG
# -------------------------------------------------------------------------
load_dotenv()

DATABASE_URL = os.getenv("DB_URL") or "postgresql://user:password@postgres:5432/mydatabase"
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_ME_super_secret")
ALGO = "HS256"
ACCESS_TOKEN_EXPIRES_MIN = 60 * 12  # 12 h

# -------------------------------------------------------------------------
# SQLAlchemy
# -------------------------------------------------------------------------
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()



def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    twitch_channel = Column(String)  # ✅ ce champ doit exister ici
    youtube_live_chat_id = Column(String)
    youtube_video_id = Column(String)
    tiktok_username = Column(String)
    youtube_username = Column(String)
    is_viewer    = Column(Boolean, nullable=False, server_default=text("TRUE"))  # <-- NEW
    created_at = Column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )


# -------------------------------------------------------------------------
# SÉCURITÉ
# -------------------------------------------------------------------------
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_ctx.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_ctx.verify(password, hashed)


def create_access_token(data: dict) -> str:
    exp = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRES_MIN)
    to_encode = data.copy()
    to_encode["exp"] = exp
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGO)


# -------------------------------------------------------------------------
# Pydantic – Schémas
# -------------------------------------------------------------------------
# URLs des workers
TWITCH_URL = "http://twitch:3001/twitch/start"
TIKTOK_URL = "http://tiktok:3002/tiktok/start"
YOUTUBE_URL = "http://youtube:3003/youtube/start"




# 📦 Modèles de données
class TwitchStartRequest(BaseModel):
    user_id: str
    twitch_channel: str


class TikTokStartRequest(BaseModel):
    user_id: str
    tiktok_username: str


class YouTubeStartRequest(BaseModel):
    user_id: str
    youtube_live_chat_id: str
    youtube_video_id: str
    

class UserCreate(BaseModel):
    username: constr(min_length=3, max_length=50)
    password: constr(min_length=6)
    streamer: bool

class UserSocialUpdate(BaseModel):
    twitch_channel: Optional[str] = None
    youtube_live_chat_id: Optional[str] = None
    youtube_video_id: Optional[str] = None
    tiktok_username: Optional[str] = None
    youtube_username: Optional[str] = None


class UserRead(BaseModel):
    user_id: int = Field(alias="id")
    username: str
    password_hash: str
    twitch_channel: Optional[str] = None
    youtube_live_chat_id: Optional[str] = None
    youtube_video_id: Optional[str] = None
    youtube_username: Optional[str] = None
    tiktok_username: Optional[str] = None
    is_viewer: bool
    created_at: datetime
      
    class Config:
        orm_mode = True
        allow_population_by_field_name = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    is_viewer: bool

app = FastAPI()

# CORS (autorise Angular en dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------------------
# ROUTES CRUD « historiques »  (/users…)
# -------------------------------------------------------------------------
api = APIRouter()

@app.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)

def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(status_code=409, detail="Username already registered")
    user = User(username=user_in.username, password_hash=hash_password(user_in.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.get("/users", response_model=List[UserRead])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(User).offset(skip).limit(limit).all()


@app.get("/users/streamers", response_model=List[UserRead])
def read_streamers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    streamers = db.query(User).filter(User.is_viewer == False).offset(skip).limit(limit).all()
    return streamers


@app.get("/users/{user_id}", response_model=UserRead)
def read_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.put("/users/{user_id}", response_model=UserRead)
def update_user(user_id: int, user_in: UserCreate, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.username = user_in.username
    user.password_hash = hash_password(user_in.password)
    db.commit()
    db.refresh(user)
    return user


@app.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()

@app.patch("/users/{user_id}/socials", response_model=UserRead)
def update_user_socials(
    user_id: int,
    social_data: UserSocialUpdate,
    db: Session = Depends(get_db)
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    for field, value in social_data.dict(exclude_unset=True).items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


# -------------------------------------------------------------------------
# ROUTER AUTH ()
# -------------------------------------------------------------------------

@api.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(status_code=409, detail="Username already taken")
    new_user = User(
        username=user_in.username, 
        password_hash=hash_password(user_in.password),
        is_viewer=not user_in.streamer        # ← logique: streamer ⇒ is_viewer = False    
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@api.post("/login", response_model=TokenOut)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user: User | None = (
        db.query(User).filter(User.username == form.username).first()
    )
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": str(user.id), "username": user.username})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "is_viewer": user.is_viewer,
    }

# -------------------------------------------------------------------------
# ROUTES POUR LES WORKERS
# -------------------------------------------------------------------------

@app.post("/twitch/start")
async def start_twitch_stream(data: TwitchStartRequest):
    if not data.twitch_channel:
        raise HTTPException(status_code=400, detail="Nom du stream Twitch requis")

    twitch_token = os.getenv("TWITCH_TOKEN")
    if not twitch_token:
        raise HTTPException(status_code=500, detail="Token Twitch non défini")
    
    print(twitch_token)

    payload = {
        "user_id": data.user_id,
        "twitch_channel": data.twitch_channel,
        "twitch_token": twitch_token  
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(TWITCH_URL, json=payload)
            response.raise_for_status()
            return response.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Erreur de connexion à Twitch worker: {e}")
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=response.status_code, detail=f"Twitch worker a retourné une erreur: {e.response.text}")


@app.post("/tiktok/start")
async def start_tiktok_stream(data: TikTokStartRequest):
    if not data.tiktok_username:
        raise HTTPException(status_code=400, detail="Nom d’utilisateur TikTok requis")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(TIKTOK_URL, json=data.dict())
            response.raise_for_status()
            return response.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Erreur de connexion à TikTok worker: {e}")
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=response.status_code, detail=f"TikTok worker a retourné une erreur: {e.response.text}")



@app.post("/youtube/start")
async def start_youtube_stream(data: YouTubeStartRequest):
    if not data.youtube_live_chat_id or not data.youtube_video_id:
        raise HTTPException(status_code=400, detail="Identifiants YouTube requis")

    token = os.getenv("YOUTUBE_ACCESS_TOKEN")
    if not token:
        raise HTTPException(status_code=500, detail="Token d'accès YouTube non défini")
    
    print(token)

    payload = data.dict()
    payload["token"] = token  

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(YOUTUBE_URL, json=payload)
            response.raise_for_status()
            return response.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Erreur de connexion à YouTube worker: {e}")
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=response.status_code, detail=f"YouTube worker a retourné une erreur: {e.response.text}")




app.include_router(api)


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
