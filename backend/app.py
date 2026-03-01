from flask import Flask, send_from_directory
from flask_cors import CORS
import os

# **FIX: Import extensions from extensions.py instead of creating them here**
# from extensions import mongo, bcrypt, jwt

app = Flask(
    __name__,
    static_folder="../FrontEnd",   # <-- point to frontend folder
    static_url_path=""
)

# app.config["MONGO_URI"] = "mongodb://localhost:27017/notes_app"
# app.config["JWT_SECRET_KEY"] = "super-secret-key"

# **FIX: Initialize extensions with init_app instead of passing app in constructor**
# mongo.init_app(app)
# bcrypt.init_app(app)
# jwt.init_app(app)

CORS(app)

# Import routes AFTER initializing extensions
# from routes.auth import auth_bp
# from routes.notes import notes_bp

# app.register_blueprint(auth_bp, url_prefix="/api/auth")
# app.register_blueprint(notes_bp, url_prefix="/api/notes")

# Serve index.html at root
@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")

if __name__ == "__main__":
    app.run(debug=True)
