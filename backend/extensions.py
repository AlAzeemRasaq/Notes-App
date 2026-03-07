from flask_pymongo import PyMongo
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager

# Extensions are created here but not attached to the app yet
mongo = PyMongo()
bcrypt = Bcrypt()
jwt = JWTManager()


# Helper functions to access collections cleanly
def get_users_collection():
    return mongo.db.users


def get_notes_collection():
    return mongo.db.notes
