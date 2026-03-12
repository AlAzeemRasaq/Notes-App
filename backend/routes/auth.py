from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from extensions import mongo, bcrypt

auth_bp = Blueprint("auth", __name__)

# =========================
# REGISTER NEW USER
# =========================
@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(force=True)
    print("[REGISTER] Received data:", data)

    # Validate input
    if not data or not data.get("username") or not data.get("email") or not data.get("password"):
        return jsonify({"message": "Missing required fields"}), 400

    # Check if email already exists
    if mongo.db.users.find_one({"email": data["email"]}):
        return jsonify({"message": "Email already registered"}), 400

    # Hash password and insert user
    hashed_pw = bcrypt.generate_password_hash(data["password"]).decode("utf-8")
    result = mongo.db.users.insert_one({
        "username": data["username"],
        "email": data["email"],
        "password": hashed_pw
    })
    print(f"[REGISTER] User created: {data['email']} (ID: {result.inserted_id})")
    return jsonify({"message": "User registered successfully"}), 201


# =========================
# LOGIN USER
# =========================
@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    print("[LOGIN] Received data:", data)

    if not data or not data.get("email") or not data.get("password"):
        return jsonify({"message": "Missing email or password"}), 400

    user = mongo.db.users.find_one({"email": data["email"]})

    # Verify password
    if user and bcrypt.check_password_hash(user["password"], data["password"]):
        token = create_access_token(identity=str(user["_id"]))
        print(f"[LOGIN] User logged in: {data['email']}")
        return jsonify({"token": token, "username": user["username"]})

    return jsonify({"message": "Invalid credentials"}), 401
