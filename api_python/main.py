# main.py
import os
from typing import List
from datetime import datetime

from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, constr
from sqlalchemy import Column, Integer, String, TIMESTAMP, text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from passlib.context import CryptContext
from dotenv import load_dotenv
import asyncio
import aio_pika
import json

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DB_URL")
if not DATABASE_URL:
    raise RuntimeError("DB_URL environment variable is not set")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLAlchemy setup
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# SQLAlchemy User model
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text('NOW()'), nullable=False)

# Pydantic schemas
class UserCreate(BaseModel):
    username: constr(min_length=3, max_length=50)
    password: constr(min_length=6)

class UserRead(BaseModel):
    id: int
    username: str
    created_at: datetime
    class Config:
        orm_mode = True

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

app = FastAPI()

# CRUD endpoints omitted for brevity (same as before)


async def consume_rabbit():
    connection = await aio_pika.connect_robust(os.getenv("AMQP_URL", "amqp://user:password@localhost/"))
    channel = await connection.channel()
    queue = await channel.declare_queue("chat-messages", durable=True)

    async with queue.iterator() as queue_iter:
        async for message in queue_iter:
            async with message.process():
                payload = json.loads(message.body.decode())
                print("[RabbitMQ] reçu :", payload)  # 👈 LOG ICI
                if payload["type"] == "chat":
                    push_chat_message(payload)
                elif payload["type"] == "viewers":
                    push_viewer_counts(payload)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(consume_rabbit())

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except WebSocketDisconnect:
                self.disconnect(connection)

manager = ConnectionManager()

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Helper functions for pushing from main process
def push_chat_message(payload: dict):
    import asyncio
    print("[WS] push_chat_message →", payload)  # 👈 LOG ICI
    asyncio.create_task(manager.broadcast({
        "type": "chat_message",
        "payload": payload
    }))
def push_viewer_counts(payload: dict):
    import asyncio
    asyncio.create_task(manager.broadcast({"type": "viewer_count", "payload": payload}))

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)