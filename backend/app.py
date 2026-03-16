from flask import Flask, send_from_directory
from flask_cors import CORS
from config import Config
from extensions import mongo, bcrypt, jwt
from routes.auth import auth_bp
from routes.notes import notes_bp
import os

# =========================
# Create Flask app
# =========================
app = Flask(
    __name__,
    static_folder="../FrontEnd",  # Points to frontend build folder
    static_url_path=""
)
app.config.from_object(Config)

# =========================
# Enable CORS
# =========================
CORS(app)

# =========================
# Initialize Flask extensions
# =========================
mongo.init_app(app)
bcrypt.init_app(app)
jwt.init_app(app)

# =========================
# Register Blueprints
# =========================
app.register_blueprint(auth_bp, url_prefix="/api/auth")   # Auth routes
app.register_blueprint(notes_bp, url_prefix="/api/notes") # Notes routes

# =========================
# Serve frontend index
# =========================
@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")

# =========================
# Catch-all 404 route
# =========================
@app.route("/<path:unknown_path>")
def catch_all(unknown_path):
    # Serve the 404 page for any unknown route
    return send_from_directory(app.static_folder, "index-404.html"), 404

# Optional: also handle 404 errors directly
@app.errorhandler(404)
def page_not_found(e):
    return send_from_directory(app.static_folder, "index-404.html"), 404

# =========================
# Run server
# =========================
if __name__ == "__main__":
    app.run(debug=True)
