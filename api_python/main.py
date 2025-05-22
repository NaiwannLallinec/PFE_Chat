# main.py
import os
from datetime import datetime

from datetime import datetime, timedelta
from typing import List, Generator
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, constr
from sqlalchemy import Column, Integer, String, TIMESTAMP, text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from passlib.context import CryptContext
from dotenv import load_dotenv
import asyncio
import aio_pika
import json
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

DATABASE_URL = os.getenv("DB_URL") or "postgresql://user:password@localhost:5432/mydatabase"
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
    to_encode = data | {"exp": exp}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGO)


# -------------------------------------------------------------------------
# Pydantic – Schémas
# -------------------------------------------------------------------------
class UserCreate(BaseModel):
    username: constr(min_length=3, max_length=50)
    password: constr(min_length=6)
    streamer: bool


class UserRead(BaseModel):
    user_id: int = Field(alias="id")
    username: str
    is_viewer: bool
    created_at: datetime
    class Config:
        orm_mode = True
        allow_population_by_field_name = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int

app = FastAPI()

# CORS (autorise Angular en dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------------------
# ROUTES CRUD « historiques »  (/users…)
# -------------------------------------------------------------------------
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


# -------------------------------------------------------------------------
# ROUTER AUTH (/api/...)
# -------------------------------------------------------------------------
api = APIRouter(prefix="/api", tags=["auth"])


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
    }


app.include_router(api)


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
