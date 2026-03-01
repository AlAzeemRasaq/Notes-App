from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

# ✅ FIX: Import from extensions, NOT from app
from extensions import mongo

notes_bp = Blueprint("notes", __name__)


@notes_bp.route("/", methods=["GET"])
@jwt_required()
def get_notes():
    user_id = get_jwt_identity()

    notes = list(mongo.db.notes.find({"user_id": user_id}))
    
    # Convert ObjectId to string
    for note in notes:
        note["_id"] = str(note["_id"])

    return jsonify(notes), 200


@notes_bp.route("/", methods=["POST"])
@jwt_required()
def create_note():
    user_id = get_jwt_identity()
    data = request.json

    new_note = {
        "title": data.get("title", ""),
        "content": data.get("content", ""),
        "user_id": user_id
    }

    mongo.db.notes.insert_one(new_note)

    return jsonify({"message": "Note created"}), 201
