from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


def test_successful_login():
    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 10)

    driver.get("http://127.0.0.1:5000/login.html")

    driver.find_element(By.ID, "email").send_keys("test@example.com")
    driver.find_element(By.ID, "password").send_keys("password123")

    # 🔥 more reliable click
    wait.until(EC.element_to_be_clickable((By.ID, "loginBtn"))).click()

    # 🔥 wait for redirect instead of sleep
    wait.until(lambda d: "index.html" in d.current_url)

    assert "index.html" in driver.current_url

    driver.quit()


def test_invalid_login():
    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 10)

    driver.get("http://127.0.0.1:5000/login.html")

    driver.find_element(By.ID, "email").send_keys("wrong@test.com")
    driver.find_element(By.ID, "password").send_keys("wrongpassword")

    wait.until(EC.element_to_be_clickable((By.ID, "loginBtn"))).click()

    # 🔥 wait for error message instead of sleep
    error_message = wait.until(
        EC.visibility_of_element_located((By.CLASS_NAME, "error-message"))
    )

    assert error_message.is_displayed()

    driver.quit()
