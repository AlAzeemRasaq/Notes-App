from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson.objectid import ObjectId
from app import mongo
from datetime import datetime

notes_bp = Blueprint("notes", __name__)

@notes_bp.route("/", methods=["GET"])
@jwt_required()
def get_notes():
    user_id = get_jwt_identity()
    notes = list(mongo.db.notes.find({"user_id": user_id}))
    
    for note in notes:
        note["_id"] = str(note["_id"])
    
    return jsonify(notes)


@notes_bp.route("/", methods=["POST"])
@jwt_required()
def create_note():
    user_id = get_jwt_identity()
    data = request.json

    note = {
        "user_id": user_id,
        "title": data.get("title", ""),
        "content": data.get("content", ""),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    note_id = mongo.db.notes.insert_one(note).inserted_id

    return jsonify({"id": str(note_id)}), 201