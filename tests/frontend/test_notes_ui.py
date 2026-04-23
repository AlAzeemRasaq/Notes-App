from selenium import webdriver
from selenium.webdriver.common.by import By
import time

def test_create_note():
    driver = webdriver.Chrome()

    driver.get("http://127.0.0.1:5000/index.html")

    # Click "New Note" button
    driver.find_element(By.ID, "newNoteBtn").click()
    # Enter note title
    driver.find_element(By.ID, "noteTitle").send_keys("UI Test Note")
    # Enter note content
    driver.find_element(By.ID, "noteContent").send_keys("Testing note creation")
    # Click "Save" button
    driver.find_element(By.ID, "saveNoteBtn").click()

    time.sleep(2)

    # Check if the new note appears in the list
    notes = driver.find_elements(By.CLASS_NAME, "note-card")

    # Assert that at least one note is present (the one we just created)
    assert len(notes) > 0

    driver.quit()

def test_search_note():
    driver = webdriver.Chrome()

    driver.get("http://127.0.0.1:5000/index.html")

    # Enter search query
    search_box = driver.find_element(By.ID, "searchInput")
    # Clear the search box first
    search_box.clear()
    search_box.send_keys("UI Test Note")

    time.sleep(2)

    notes = driver.find_elements(By.CLASS_NAME, "note-card")

    assert len(notes) >= 1

    driver.quit()

def test_archive_note():
    driver = webdriver.Chrome()

    driver.get("http://127.0.0.1:5000/index.html")

    # Find the first note's archive button and click it
    archive_button = driver.find_element(By.CLASS_NAME, "archive-btn")
    # Click the archive button
    archive_button.click()

    time.sleep(2)

    # Check if the note is marked as archived (this will depend on how the UI indicates archived notes)
    assert "archived" in driver.page_source.lower()

    driver.quit()

def test_delete_note():
    driver = webdriver.Chrome()

    driver.get("http://127.0.0.1:5000/index.html")

    # Find the first note's delete button and click it
    delete_button = driver.find_element(By.CLASS_NAME, "delete-btn")
    # Click the delete button
    delete_button.click()

    time.sleep(2)
    # Check if the note is moved to trash (this will depend on how the UI indicates trashed notes)
    assert "trash" in driver.page_source.lower()

    driver.quit()
