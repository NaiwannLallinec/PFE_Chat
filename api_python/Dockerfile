# Utilise une image officielle Python comme image parente
FROM python:3.11-slim

# Définit le répertoire de travail dans le conteneur
WORKDIR /app

# Copie les fichiers requirements.txt dans le conteneur
COPY requirements.txt .

# Installe les dépendances Python
RUN pip install --no-cache-dir -r requirements.txt

# Copie le reste des fichiers de l'application dans le conteneur
COPY . .

# Expose le port utilisé par FastAPI (par défaut 8000)
EXPOSE 8000

# Commande pour lancer l'application FastAPI avec uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
