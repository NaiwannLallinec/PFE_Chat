# PFE_Chat

PFE_Chat is a fullstack chat aggregator designed to combine real-time chat and viewer data from multiple streaming platforms (Twitch, YouTube, TikTok) into a single unified web application. The project is split into several components using Angular (frontend), Python FastAPI (API/backend), and Node.js (microservices and OAuth).

## Features

- **Real-time chat aggregation** for Twitch, YouTube, and TikTok
- **Viewer count aggregation** across all supported platforms
- **User authentication and registration** (with streamer/viewer roles)
- **OAuth integration** for Twitch and YouTube accounts
- **Channel management** for streamers (add/edit your streaming channels)
- **Admin and public interfaces** (legacy HTML and Angular front)
- **Draggable/resizable chat UI, theme switching (day/night)** in the chat window
- **Microservice architecture** with Docker and RabbitMQ for message brokering

## Technologies

- **Frontend:** Angular 18 (TypeScript, HTML, CSS)
- **Backend API:** Python FastAPI (with SQLAlchemy, JWT, bcrypt)
- **Microservices:** Node.js (Express, Socket.IO, tmi.js, amqplib)
- **Database:** PostgreSQL (via Docker)
- **Message queue:** RabbitMQ (via Docker)
- **Deployment:** Docker, Docker Compose

## Directory Structure

- `front/` – Angular frontend app (main user interface)
- `api_python/` – FastAPI backend (user, login, registration, streamer management)
- `consumer/` – Node.js service (Socket.IO, RabbitMQ consumer, chat gateway)
- `services/twitch/` – Twitch chat service (Node.js, tmi.js)
- `legacy/` – Legacy Node.js OAuth/auth services and static HTML UIs

## Setup & Installation

### Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- Node.js (v18+) and npm (for local development)
- Python 3.9+ (for API development)
- PostgreSQL (used via Docker by default)

### Local Development (Monolithic)

1. **Clone the Repository**
   ```sh
   git clone https://github.com/NaiwannLallinec/PFE_Chat.git
   cd PFE_Chat
   ```

2. **Environment Variables**
   - Copy `.env.example` to `.env` and fill in secrets for Twitch/YouTube API, DB URL, etc.

3. **Start the Stack with Docker Compose**
   ```sh
   docker-compose up --build
   ```
   This will start all services: frontend (Angular), backend (FastAPI), database, RabbitMQ, and chat microservices.
   
5. **Access the Application:**
   - Open [http://localhost:4200](http://localhost:4200) (or the port specified in your `docker-compose.yml`) to use PFE_Chat.


## Usage

- **Register/Login:** Choose to sign up as a viewer or streamer.
- **Viewers:** Select and follow streamers, view their chat, and interact.
- **Streamers:** Connect your Twitch, YouTube, and TikTok channels via OAuth, configure your channels, and aggregate chat/viewer data in one dashboard.
- **Chat Gateway:** All messages and viewer counts are synchronized across platforms using Socket.IO.

