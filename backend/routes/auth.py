from flask import Blueprint, jsonify
from flask_jwt_extended import create_access_token
from extensions import mongo, bcrypt
from flask import request
import logging

# Blueprint for auth routes and logger setup
auth_bp = Blueprint("auth", __name__)
logger = logging.getLogger(__name__)

# HELPER
def get_json_request():
    data = request.get_json(silent=True)

    if not data or not isinstance(data, dict):
        return {} # Return empty dict if no JSON or invalid JSON provided

    return data

# REGISTER NEW USER
@auth_bp.route("/register", methods=["POST"])
def register():
    data = get_json_request()

    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not username or not email or not password:
        return jsonify({"message": "Missing required fields"}), 400

    logger.info(f"[REGISTER_ATTEMPT] email={email}")

    # Check if email already exists
    if mongo.db.users.find_one({"email": email}):
        return jsonify({"message": "Email already registered"}), 400

    # Hash the password before storing
    hashed_pw = bcrypt.generate_password_hash(password).decode("utf-8")

    # Insert new user into the database
    result = mongo.db.users.insert_one({
        "username": username,
        "email": email,
        "password": hashed_pw
    })
    
    # Log successful registration
    logger.info(f"[REGISTER_SUCCESS] email={email} user_id={result.inserted_id}")
    return jsonify({"message": "User registered successfully"}), 201


# LOGIN USER
@auth_bp.route("/login", methods=["POST"])
def login():
    data = get_json_request()

    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not email or not password:
        return jsonify({"message": "Missing email or password"}), 400

    logger.info(f"[LOGIN_ATTEMPT] email={email}")

    user = mongo.db.users.find_one({"email": email})

    # Verify user exists and password matches
    if user and bcrypt.check_password_hash(user["password"], password):
        # Create JWT token with user ID as identity
        token = create_access_token(identity=str(user["_id"]))

        # Log successful login
        logger.info(f"[LOGIN_SUCCESS] email={email}")

        return jsonify({
            "token": token,
            "username": user["username"]
        }), 200

    # Log failed login attempt
    logger.warning(f"[LOGIN_FAILED] email={email}")
    return jsonify({"message": "Invalid credentials"}), 401
