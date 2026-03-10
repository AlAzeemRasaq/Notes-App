import json
from extensions import mongo
from app import app
from datetime import datetime


with app.app_context():

    with open("notes.json", "r") as f:
        notes = json.load(f)

    for note in notes:

        mongo.db.notes.insert_one({
            "user_id": note["user_id"],
            "title": note["title"],
            "content": note["content"],
            "updated_at": datetime.utcnow()
        })

    print("Notes inserted into MongoDB!")
