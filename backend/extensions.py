from flask_pymongo import PyMongo
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager

# =========================
# Create instances (not attached yet)
# =========================
mongo = PyMongo()
bcrypt = Bcrypt()
jwt = JWTManager()

# =========================
# Helper functions for collections
# =========================
def users_collection():
    return mongo.db.users

def notes_collection():
    return mongo.db.notes
