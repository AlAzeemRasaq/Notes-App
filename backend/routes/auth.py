from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from bson.objectid import ObjectId
from app import mongo, bcrypt

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.json

    hashed_pw = bcrypt.generate_password_hash(data["password"]).decode("utf-8")

    user_id = mongo.db.users.insert_one({
        "username": data["username"],
        "email": data["email"],
        "password": hashed_pw
    }).inserted_id

    return jsonify({"message": "User registered"}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.json
    user = mongo.db.users.find_one({"email": data["email"]})

    if user and bcrypt.check_password_hash(user["password"], data["password"]):
        access_token = create_access_token(identity=str(user["_id"]))
        return jsonify({"token": access_token})

    return jsonify({"message": "Invalid credentials"}), 401