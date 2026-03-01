from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token

# **FIX: Import from extensions instead of app**
from extensions import mongo, bcrypt

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.json

    # Basic validation (optional but recommended)
    if not data or not data.get("email") or not data.get("password") or not data.get("username"):
        return jsonify({"message": "Missing required fields"}), 400

    # Check if email already exists
    if mongo.db.users.find_one({"email": data["email"]}):
        return jsonify({"message": "Email already registered"}), 400

    hashed_pw = bcrypt.generate_password_hash(data["password"]).decode("utf-8")

    mongo.db.users.insert_one({
        "username": data["username"],
        "email": data["email"],
        "password": hashed_pw
    })

    return jsonify({"message": "User registered successfully"}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.json

    if not data or not data.get("email") or not data.get("password"):
        return jsonify({"message": "Missing email or password"}), 400

    user = mongo.db.users.find_one({"email": data["email"]})

    if user and bcrypt.check_password_hash(user["password"], data["password"]):
        access_token = create_access_token(identity=str(user["_id"]))
        return jsonify({"token": access_token})

    return jsonify({"message": "Invalid credentials"}), 401
