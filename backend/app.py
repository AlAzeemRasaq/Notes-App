from flask import Flask
from flask_pymongo import PyMongo
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager
from flask_cors import CORS

app = Flask(__name__)

app.config["MONGO_URI"] = "mongodb://localhost:27017/notes_app"
app.config["JWT_SECRET_KEY"] = "super-secret-key"

mongo = PyMongo(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)

CORS(app)

# Import routes
from routes.auth import auth_bp
from routes.notes import notes_bp

app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(notes_bp, url_prefix="/api/notes")

if __name__ == "__main__":
    app.run(debug=True)