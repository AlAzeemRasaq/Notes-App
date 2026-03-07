import json
from extensions import mongo, bcrypt
from app import app  # needed to initialize Flask context

# Make sure Flask context is active
with app.app_context():
    # Load JSON file
    with open("users.json", "r") as f:
        users = json.load(f)

    # Insert into MongoDB
    for user in users:
        hashed_pw = bcrypt.generate_password_hash(user["password"]).decode("utf-8")
        mongo.db.users.insert_one({
            "username": user["username"],
            "email": user["email"],
            "password": hashed_pw
        })

    print("Users inserted into MongoDB!")
