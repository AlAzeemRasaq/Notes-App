from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
from config import Config
from extensions import mongo, bcrypt, jwt
from routes.auth import auth_bp
from routes.notes import notes_bp
import os, logging, traceback

def create_app(config_override=None):
    # Create Flask app
    app = Flask(
        __name__,
        static_folder="../FrontEnd",  # Points to frontend build folder
        static_url_path=""
    )

    # Load config
    app.config.from_object(Config)

    # Override (used in tests)
    if config_override:
        app.config.update(config_override)

    # Enable CORS
    CORS(app)

    # Logging setup
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s"
    )

    logger = logging.getLogger(__name__)

    # Initialize Flask extensions
    mongo.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)

    # Register Blueprints
    app.register_blueprint(auth_bp, url_prefix="/api/auth")   # Auth routes
    app.register_blueprint(notes_bp, url_prefix="/api/notes") # Notes routes

    # ===== ROUTES =====

    # Serve frontend index
    @app.route("/")
    def serve_index():
        return send_from_directory(app.static_folder, "index.html")

    # Catch-all 404 route
    @app.route("/<path:unknown_path>")
    def catch_all(unknown_path):
        # Serve the 404 page for any unknown route
        return send_from_directory(app.static_folder, "index-404.html"), 404

    # Optional: also handle 404 errors directly
    @app.errorhandler(404)
    def page_not_found(e):
        return send_from_directory(app.static_folder, "index-404.html"), 404

    # Global error handler for unexpected exceptions
    @app.errorhandler(Exception)
    def handle_error(e):
        # Capture request context
        req_info = {
            "method": request.method,
            "path": request.path,
            "ip": request.remote_addr
        }

        # Full traceback
        tb = traceback.format_exc()

        # Log everything
        logger.error(
            f"🔥 ERROR | {req_info}\n{tb}"
        )

        # Response to client (safe, no internal leak in prod later)
        return jsonify({
            "message": "Internal server error"
        }), 500
    
    return app

# Run server
if __name__ == "__main__":
    app = create_app()
    app.run(debug=True)
