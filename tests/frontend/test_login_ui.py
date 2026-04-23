from selenium import webdriver
from selenium.webdriver.common.by import By
import time


def test_successful_login():
    driver = webdriver.Chrome()

    driver.get("http://127.0.0.1:5000/login.html")

    # Enter email
    driver.find_element(By.ID, "email").send_keys("test@example.com")
    # Enter password
    driver.find_element(By.ID, "password").send_keys("password123")
    # Click login button
    driver.find_element(By.ID, "loginBtn").click()

    time.sleep(2)

    # Check redirect
    assert "index.html" in driver.current_url

    driver.quit()

def test_invalid_login():
    driver = webdriver.Chrome()

    driver.get("http://127.0.0.1:5000/login.html")

    driver.find_element(By.ID, "email").send_keys("wrong@test.com")
    driver.find_element(By.ID, "password").send_keys("wrongpassword")
    driver.find_element(By.ID, "loginBtn").click()

    time.sleep(2)

    error_message = driver.find_element(By.CLASS_NAME, "error-message")

    # Check if error message is displayed
    assert error_message.is_displayed()

    driver.quit()
