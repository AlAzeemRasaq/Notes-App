# routes/auth.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from extensions import mongo, bcrypt

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(force=True)
    if not data or not data.get("email") or not data.get("password") or not data.get("username"):
        return jsonify({"message": "Missing required fields"}), 400

    if mongo.db.users.find_one({"email": data["email"]}):
        return jsonify({"message": "Email already registered"}), 400

    hashed_pw = bcrypt.generate_password_hash(data["password"]).decode("utf-8")
    mongo.db.users.insert_one({
        "username": data["username"],
        "email": data["email"],
        "password": hashed_pw
    })

    print(f"[REGISTER] User created: {data['email']}")
    return jsonify({"message": "User registered successfully"}), 201

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    if not data or not data.get("email") or not data.get("password"):
        return jsonify({"message": "Missing email or password"}), 400

    user = mongo.db.users.find_one({"email": data["email"]})
    if user and bcrypt.check_password_hash(user["password"], data["password"]):
        token = create_access_token(identity=str(user["_id"]))
        print(f"[LOGIN] User logged in: {data['email']}")
        return jsonify({"token": token, "username": user["username"]})

    return jsonify({"message": "Invalid credentials"}), 401
