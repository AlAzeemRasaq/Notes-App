from flask_pymongo import PyMongo
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager

# Extensions are created here but not attached to the app yet
mongo = PyMongo()
bcrypt = Bcrypt()
jwt = JWTManager()

# Helper functions to access collections cleanly
def users_collection():
    return mongo.db.users

def notes_collection():
    return mongo.db.notes
