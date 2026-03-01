from flask_pymongo import PyMongo
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager

# **NEW: Extensions are created here WITHOUT attaching to app**
mongo = PyMongo()
bcrypt = Bcrypt()
jwt = JWTManager()
