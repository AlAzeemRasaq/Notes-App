from flask import Flask, send_from_directory
from flask_cors import CORS
from config import Config
from extensions import mongo, bcrypt, jwt
from routes.auth import auth_bp
from routes.notes import notes_bp

import os

app = Flask(
    __name__,
    static_folder="../FrontEnd",
    static_url_path=""
)
app.config.from_object(Config)
CORS(app)

# Initialize Extensions
mongo.init_app(app)
bcrypt.init_app(app)
jwt.init_app(app)

# Register Blueprints
app.register_blueprint(auth_bp, url_prefix="/api")
app.register_blueprint(notes_bp, url_prefix="/api/notes")

# Serve Frontend
@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")

if __name__ == "__main__":
    app.run(debug=True)
