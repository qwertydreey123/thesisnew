from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from flask_bcrypt import Bcrypt
import os
import mysql.connector
import openai
import re
import random
from functools import wraps
from datetime import timedelta
from dotenv import load_dotenv
load_dotenv()


app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key'  # Change this later
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)  # Session valid for 7 days

# Initialize extensions
bcrypt = Bcrypt(app)

# Connect to MySQL
db = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    port=int(os.getenv("DB_PORT")),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_DATABASE")
)
cursor = db.cursor(dictionary=True)

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash('You must be logged in to access this page.', 'warning')
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function


# --- Routes ---

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))



@app.route('/favicon.ico')
def favicon():
    return '', 204  # Returns no content, effectively ignoring the request



@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()

        if user and bcrypt.check_password_hash(user['password'], password):
            session.permanent = True  # ← This is key!
            session['user_id'] = user['id']
            print(f"User ID saved to session: {session['user_id']}")  # Debug print
            return jsonify({'success': True, 'redirect': url_for('dashboard')})
        else:
            return jsonify({'success': False, 'message': 'Invalid username or password.'})

    return render_template('login.html')

def get_user_from_db():
    user_id = session.get('user_id')
    if not user_id:
        flash('You must be logged in to view your profile.', 'warning')
        return redirect(url_for('login'))

    cursor.execute("SELECT first_name, last_name, gender, id FROM users WHERE id = %s", (user_id,))
    user = cursor.fetchone()

    if user:
        return user
    else:
        return None



@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username'].strip()
        first_name = request.form['first_name'].strip()
        last_name = request.form['last_name'].strip()
        birth_day = request.form['birth_day']
        birth_month = request.form['birth_month']
        birth_year = request.form['birth_year']
        gender = request.form['gender']
        password = request.form['password']
        confirm_password = request.form['confirm_password']

        # Validate minimum username length
        if len(username) < 3:
            flash('Username must be at least 3 characters.', 'danger')
            return redirect(url_for('register'))

        # Validate minimum password length
        if len(password) < 6:
            flash('Password must be at least 6 characters.', 'danger')
            return redirect(url_for('register'))

        # Check password match
        if password != confirm_password:
            flash('Passwords do not match!', 'danger')
            return redirect(url_for('register'))

        try:
            cursor = db.cursor()

            # Check if username already exists
            cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
            if cursor.fetchone():
                flash('Username already exists.', 'danger')
                cursor.close()
                return redirect(url_for('register'))

            # Hash the password
            hashed_pw = bcrypt.generate_password_hash(password).decode('utf-8')

            # Insert new user
            cursor.execute("""
                INSERT INTO users 
                (username, first_name, last_name, birth_day, birth_month, birth_year, gender, password)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (username, first_name, last_name, birth_day, birth_month, birth_year, gender, hashed_pw))

            # Get new user_id
            cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_id = cursor.fetchone()[0]

            # Insert default skin
            cursor.execute("""
                INSERT INTO user_skins (user_id, skin_code, map, claimed, equipped)
                VALUES (%s, 'default', NULL, 1, 1)
            """, (user_id,))

            # Insert default progress for all maps
            maps = [
                'multiplication',
                'addition',
                'subtraction',
                'division',
                'counting',
                'comparison',
                'numerals',
                'placevalue'
            ]

            for map_name in maps:
                cursor.execute("""
                    INSERT INTO user_game_progress (user_id, map, stage_key, correct, wrong, total, difficulty)
                    VALUES (%s, %s, '1', 0, 0, 0, 'easy')
                """, (user_id, map_name))

            # Commit all changes
            db.commit()
            cursor.close()

            flash('Registration successful! You can now log in.', 'success')
            return redirect(url_for('register'))

        except Exception as e:
            db.rollback()
            print(f"[Registration Error] {e}")
            flash('An error occurred during registration. Please try again.', 'danger')
            return redirect(url_for('register'))

    return render_template('register.html')





# 🔥 OpenRouter Setup
openai.api_base = "https://openrouter.ai/api/v1"
openai.api_key = "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"  # ← Replace this with your OpenRouter API Key

# 👇 Add this function above your chatbot_api route





def emoji_math(question: str):
    question = question.lower().strip()
    numbers = list(map(int, re.findall(r'\d+', question)))
    if len(numbers) != 2:
        return None  # This function only supports 2-number questions

    n1, n2 = numbers

    MAX_EMOJIS = 20
    emojis = ["🍎", "🍉", "🍓", "🎂", "🍭"]
    emoji = random.choice(emojis)

    # Addition
    if any(op in question for op in ["add", "addition", "plus", "+"]):
        if n1 <= MAX_EMOJIS and n2 <= MAX_EMOJIS:
            lines = []
            lines.append("Please count the emoji below\n")
            lines.append("Addition means putting two groups together to find out how many there are in total.\n")
            lines.append(f"Here is the first group of {n1} {emoji}:\n")
            lines.append(f"{emoji * n1}\n")
            lines.append(f"Here is the second group of {n2} {emoji}:\n")
            lines.append(f"{emoji * n2}\n")
            lines.append("Now, let's put them together:\n")
            lines.append(f"{emoji * (n1 + n2)}\n")
            lines.append("How many are there in total?")
            return '\n'.join(lines)
        else:
            return None


    # Subtraction (ensure n1 >= n2 to avoid negative emojis)
    if any(op in question for op in ["subtract", "subtraction", "minus", "-"]) and n1 >= n2:
        if n1 <= MAX_EMOJIS and n2 <= MAX_EMOJIS:
            lines = []
            lines.append("Please count the emoji below\n")
            lines.append("Subtraction helps us find out how many are left when some are taken away.\n")
            lines.append(f"Imagine you have {n1} {emoji}, but then you give away {n2} {emoji}.\n")
            lines.append(f"Here are your {n1} {emoji}:\n")
            lines.append(f"{emoji * n1}\n")
            # Show the remaining emojis after taking away n2 emojis
            remaining = n1 - n2
            lines.append(f"After giving away {n2} {emoji}, you have:\n")
            lines.append(f"{emoji * remaining}\n")
            lines.append("How many do you think are left?")
            return '\n'.join(lines)
        else:
            return None



    # Multiplication (show n1 groups each containing n2 emojis)
    if any(op in question for op in ["multiply", "multiplication", "times", "x", "*"]):
        total = n1 * n2
        if total <= MAX_EMOJIS:
            lines = []
            lines.append("Multiplication is like having several groups of the same number of things!\n")
            lines.append(f"Imagine you have {n1} baskets, and each basket has {n2} {emoji} inside.\n")
            lines.append("Let's look at each basket:\n")
            for i in range(n1):
                lines.append(f"Basket {i+1}: {emoji * n2}\n")
            lines.append("Now, let's count all the emojis in all the baskets together.\n")
            lines.append("Can you figure out how many emojis there are in total?")
            return '\n'.join(lines)
        else:
            return None


    # Division (clean version — no repeated line)
    if any(op in question for op in ["divide", "division", "/"]):
        if n1 <= MAX_EMOJIS and n2 != 0 and n1 % n2 == 0:
            group_size = n1 // n2
            lines = []
            lines.append("Please count the emoji below\n")
            lines.append(f"Let's divide {n1} {emoji} into {n2} equal groups.\n")
            lines.append(f"We want to share {n1} {emoji} equally into {n2} groups.\n")
            lines.append(f"Each group will have some {emoji}. Let's see how many:\n")
            for i in range(n2):
                lines.append(f"Group {i+1}: {emoji * group_size}")
            lines.append(f"So, each group has {group_size} {emoji}.\n")
            return '\n'.join(lines)
        else:
            return None


    # Comparison
    if any(op in question for op in ["greater than", "less than", "equal", "greater", "less", "which is greater", "which is less"]):
        if n1 <= MAX_EMOJIS and n2 <= MAX_EMOJIS:
            emoji1 = emoji
            emoji2 = random.choice(["🍇", "🍍", "🍉", "🍎", "🍓"])  # Different emoji for contrast

            lines = []
            lines.append("Let's learn about comparing numbers and groups!\n")
            lines.append(f"{emoji1 * n1} ({n1})  ?  {emoji2 * n2} ({n2})\n")
            lines.append("Look carefully at these two groups of fruits.")
            lines.append(f"Group 1 has {n1} {emoji1}s.")
            lines.append(f"Group 2 has {n2} {emoji2}s.\n")
            lines.append("👉 When one number or group is GREATER, it means it has MORE than the other.")
            lines.append("👉 When one number or group is LESS, it means it has FEWER than the other.")
            lines.append("👉 When both groups are the SAME, they have EQUAL amounts.\n")
            lines.append("So, is the first group >, <, or = the second group?")
            lines.append("Think about it and pick the right symbol!")

            return '\n'.join(lines)
        else:
            return None



    # Counting / word problem hints
    if any(op in question for op in ["count", "how many", "word problem", "more", "fewer", "left"]):
        if n1 <= MAX_EMOJIS:
            lines = []
            lines.append("Let's practice counting!\n")
            lines.append("Here are some fruits for you:\n")
            lines.append(f"{emoji * n1} ({n1})\n")
            lines.append("Can you count how many fruits are here?")
            lines.append("Take your time and try to count each fruit carefully.\n")
            return '\n'.join(lines)
        else:
            return None







allowed_interactions = {
    "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
    "thank you", "thanks", "ty", "ok", "okay", "yes", "no", "sure", "alright"
}

math_keywords = [
    "add", "addition", "plus",
    "subtract", "subtraction", "minus",
    "multiply", "multiplication", "times",
    "divide", "division",
    "count", "number", "place value", "roman numeral", "compare",
    "greater than", "less than", "equal",
    "word problem", "how many", "left", "more", "fewer",
    "counting forward", "skip counting", "counting backwards",
    "borrowing", "regrouping", "long division",
    "reading roman numerals", "converting roman numerals",
    "ones", "tens", "hundreds", "thousands", "ten thousands"
]

yes_responses = {"yes", "yeah", "yep", "sure", "more help", "help"}
no_responses = {"no", "nah", "nope", "stop"}

def is_math_question(message: str) -> bool:
    has_number = bool(re.search(r'\d', message))
    has_keyword = any(k in message for k in math_keywords)
    return has_number or has_keyword

def compute_answer(question: str):
    try:
        numbers = list(map(float, re.findall(r'\d+', question)))
        if len(numbers) < 2:
            return None

        if any(op in question for op in ["add", "plus", "+"]):
            return int(numbers[0] + numbers[1])
        elif any(op in question for op in ["subtract", "minus", "-"]):
            return int(numbers[0] - numbers[1])
        elif any(op in question.lower() for op in ["multiply", "multiplication", "times", "x", "*"]):
            return int(numbers[0] * numbers[1])
        elif any(op in question for op in ["divide", "division", "/", "divided by", "over", "÷"]):
            if numbers[1] == 0:
                return None
            return int(numbers[0] / numbers[1])
        else:
            return None
    except:
        return None


def check_answer(user_answer: str, expected_answer) -> bool:
    try:
        numbers = re.findall(r'\d+\.?\d*', user_answer)
        print(f"Extracted numbers from user answer: {numbers}")
        if not numbers:
            return False
        user_num = int(float(numbers[0]))
        expected_num = int(float(expected_answer))
        print(f"User number: {user_num}, Expected number: {expected_num}")
        return user_num == expected_num
    except Exception as e:
        print(f"Error in check_answer: {e}")
        return False

keyword_synonyms = {
    "plus": "add",
    "addition": "add",
    "minus": "subtract",
    "subtraction": "subtract",
    "times": "multiply",
    "multiplied": "multiply",
    "multiplication": "multiply",
    "divide": "divide",
    "division": "divide",
    "greater than": "greater than",
    ">": "greater than",
    "less than": "less than",
    "<": "less than",
    "equal": "equal",
    "=": "equal",
    "counting": "count",
    "count": "count",
    "place value": "place value",
    "placevalue": "place value",
    # add more as needed
}

tips_per_topic = {
    "add": [
        "Adding means putting groups together to find out how many there are in all. Try counting one by one to see the total!",
        "When you add, you count all the things together to get a bigger number. For example, if you have 3 apples and add 2 more, count them all to see how many you have.",
        "Add by starting with one group and then counting on the next group. Like putting together two sets of blocks and counting all the blocks one by one.",
        "Think of adding as putting two piles of toys together. How many toys do you have now? You can count each toy to find the total.",
        "When you add, you just put numbers together like stacking blocks. Try it yourself by using your fingers or objects around you!",
        "Adding helps you find out how many things there are altogether. It’s like making a bigger group from smaller groups.",
        "You can add numbers in any order, and you will still get the same answer. This is called the commutative property of addition.",
        "Try adding numbers by counting up from the bigger number. For example, start at 5 and count up 3 more: 6, 7, 8.",
        "Adding is useful for many real-life things, like putting together candies, toys, or friends in a group.",
        "Practice adding small numbers first, then try bigger numbers to get better at it."
    ],
    "addition": [
        "Addition is like joining groups to see how many you have in total. For example, joining 4 red balls and 3 blue balls means adding 4 and 3.",
        "Try counting all the parts together carefully when you add. Make sure you don’t miss any objects!",
        "When you add, you start from one number and count on more numbers to find the total.",
        "Think of addition as collecting items and counting the total number you have in your collection.",
        "Adding helps you find the whole when you have parts. For example, if you have 2 parts of a puzzle and add 3 more, you have 5 parts in all.",
        "Use addition when you want to find out how many things are combined or joined together.",
        "Addition is the foundation for learning more math, like multiplication and problem-solving.",
        "You can add numbers in any order and still get the same answer, which makes adding easier.",
        "Try using number lines to help you add numbers by moving forward step by step.",
        "Practice addition with real things like coins, toys, or snacks to understand it better."
    ],
    "plus": [
        "The plus sign (+) means add or join groups together. It tells you to put numbers together and find the total.",
        "When you see plus, it means put numbers together and count all the objects to get a bigger number.",
        "Try thinking of plus as putting pieces together to get bigger numbers, like stacking blocks or joining friends in a game.",
        "Plus is a way to say 'add more' — so when you see plus, think about how many you will have in total.",
        "Use plus to combine numbers and find the total amount quickly and easily.",
        "The plus sign helps show that you want to add two or more numbers together.",
        "You can use plus many times in a math problem to keep adding groups step by step.",
        "Plus signs are used everywhere in math to tell you to add things, from simple sums to bigger problems.",
        "Try to say 'plus' out loud when you see the sign (+) to remember it means to add.",
        "Practice adding with the plus sign by solving small math problems with friends or family."
    ],
    "subtract": [
        "Subtracting means taking some away. Try counting how many are left after you take some away from a group.",
        "When you subtract, you start with a number and take away parts to see what remains or is left.",
        "Think of subtracting like eating some candies from a bowl. How many candies are left after you eat some?",
        "Try to count backwards when you subtract to find the answer. For example, if you have 7 and take away 2, count backwards 6, 5.",
        "Subtracting is like sharing and giving some away. Can you try to find how many remain after giving some?",
        "Subtracting helps you find the difference between numbers or how much less one number is compared to another.",
        "You can use subtraction to solve problems like how many toys are left after some are lost or given away.",
        "Subtracting means finding out what is left when you take away from a whole group.",
        "Practice subtraction by taking away objects and counting what remains to understand it better.",
        "Remember, subtraction is the opposite of addition, and they work together to help you solve problems."
    ],
    "subtraction": [
        "Subtraction is when you take away from a number to see what's left or remains after some parts are removed.",
        "Try counting backwards when subtracting to find the answer quickly and correctly.",
        "When you subtract, imagine some things are gone or taken away. How many remain after that?",
        "Subtraction helps you find out what is left after some are taken away from a group.",
        "Take away numbers carefully and count what remains to get the correct answer.",
        "You can use subtraction in many real life situations, like sharing candies or finding how many apples are left.",
        "Subtraction is helpful when comparing numbers and finding the difference between them.",
        "Try to use number lines to move backwards when subtracting to help you understand it better.",
        "Practice subtraction with objects you can see and touch, like toys or blocks, to make learning fun.",
        "Subtraction and addition are partners; knowing both helps you solve many math problems."
    ],
    "minus": [
        "The minus sign (-) means take away or subtract. It tells you to find out how many are left after removing some.",
        "Minus means you have less. Try counting backward to see how many are left after taking some away.",
        "When you see minus, you remove some from the total number and find what remains.",
        "Minus helps you find how much is left after taking some away from a group or amount.",
        "Use minus to find out how many fewer things you have after subtraction.",
        "The minus sign is important to show subtraction in math problems and equations.",
        "Try to say 'minus' when you see the sign (-) to remember it means to subtract.",
        "You can use minus many times when subtracting multiple numbers step by step.",
        "Practice subtraction problems with the minus sign to get faster and better at math.",
        "Minus is a key symbol to understand when learning about taking away and differences."
    ],

    "multiply": [
        "Multiplying means you add the same number over and over again. For example, 3 times 4 means you add 3 four times: 3 + 3 + 3 + 3.",
        "Try thinking of multiplication as putting groups of the same size together. Like if you have 5 baskets and each basket has 2 apples, you multiply 5 times 2 to find out how many apples there are in total.",
        "Multiplication helps you count faster because instead of adding one by one, you can jump in groups. It’s like a shortcut to adding many numbers.",
        "When you multiply, you find out how many things there are altogether by counting groups of the same size. For example, if you have 4 groups of 3 toys, you multiply 4 times 3 to know the total toys.",
        "Use multiplication whenever you want to count many groups quickly. It helps with things like sharing snacks evenly, counting legs of animals, or finding how many wheels on many bikes.",
        "Multiplication is also called repeated addition. If you know how to add, multiplication is just adding the same number several times.",
        "You can use your fingers or draw pictures to help understand multiplication better. For example, draw 3 circles with 4 dots each to see how many dots in total.",
        "Multiplying can make solving problems easier and faster. Instead of adding 2 + 2 + 2 + 2 + 2, you just say 2 times 5, which equals 10.",
        "Practice multiplication with real things around you, like counting candies in packs or the number of chairs in rows.",
        "Multiplication helps in many games and real life situations, like sharing or organizing things into equal groups."
    ],

    "multiplication": [
        "Multiplication means putting equal groups together to find the total number of items quickly.",
        "Imagine you have several baskets, each with the same number of apples inside. Counting all apples is multiplication!",
        "Try to count groups quickly by multiplying instead of adding one by one.",
        "Multiplication is like repeated addition. For example, 4 groups of 3 means adding 3 + 3 + 3 + 3.",
        "Use multiplication to solve problems when you have many groups or sets of things.",
        "Multiplication helps you find totals faster when you know how many items are in each group and how many groups there are.",
        "Multiplying zero with any number always gives zero because there are no groups to count.",
        "Practice multiplying small numbers first and then try bigger ones to become faster and better.",
        "Remember, multiplication answers are called products, and the numbers you multiply are called factors.",
        "You can use multiplication in everyday life, like figuring out how many legs are on many animals or how many wheels on several bikes."
    ],
    "times": [
        "The times sign (×) means multiply or find groups of numbers together.",
        "Times means you add the same number again and again. For example, 3 × 4 means 3 added 4 times.",
        "Think of times as counting groups that all have the same amount inside them.",
        "When you see the times sign, multiply the numbers to find the total quickly instead of adding repeatedly.",
        "Use times to find how many things there are in many groups or sets.",
        "The times symbol helps you understand multiplication in math problems and equations.",
        "Say 'times' out loud when you see the sign × to remember it means multiply.",
        "Try solving multiplication problems with the times sign to practice and get faster.",
        "Times can be used in word problems, like finding total candies in several boxes with equal candies inside.",
        "Multiplication times tables help you quickly find answers for times problems."
    ],
    "divide": [
        "Dividing means sharing things equally among groups or parts.",
        "Try to split a big group into smaller equal parts when you divide.",
        "Division helps you find out how many items are in each group when sharing or splitting.",
        "Imagine cutting a pizza into equal slices — that’s dividing the pizza fairly.",
        "Use division to share or split things evenly so everyone gets the same amount.",
        "Division is the opposite of multiplication — it helps you find how many groups or how big each group is.",
        "When you divide, you check how many times one number fits into another number evenly.",
        "Practice dividing small numbers first to understand sharing equally.",
        "Division can also help find remainders when something doesn’t split evenly.",
        "Use division in real life to share candies, money, or toys fairly with friends."
    ],
    "division": [
        "Division means splitting a number into equal parts or groups to find how many or how big each part is.",
        "Try sharing numbers equally to understand how division works.",
        "Division helps you see how many groups or parts you can make from a total amount.",
        "Think of division like sharing candies fairly with friends, making sure each friend gets the same number.",
        "Use division to divide things into smaller equal pieces when you want to split something.",
        "Division answers are called quotients, and the number you divide by is called the divisor.",
        "Division can sometimes leave a remainder if things don’t split evenly.",
        "Practice division with objects to see how splitting works in real life.",
        "Use number lines or grouping to help understand division better.",
        "Division is important for many real-life problems, like dividing food or money."
    ],
    "count": [
        "Counting means saying numbers one by one in the right order to find out how many things there are.",
        "Try counting objects slowly and carefully to make sure you don’t miss any items.",
        "Counting helps you find out how many things are in a group or set.",
        "Start counting from one and keep going until you count all the objects.",
        "Use your fingers, toys, or other objects to help you count better.",
        "Counting is the first step in learning math and helps with addition and subtraction later.",
        "Try counting forwards and backwards to get better at numbers.",
        "You can count by ones, twos, fives, or tens as you get more comfortable with numbers.",
        "Practice counting objects around you like books, pencils, or apples.",
        "Counting well helps you understand numbers and how they work."
    ],
    "number": [
        "Numbers tell us how many things there are or how much of something we have.",
        "Try reading numbers from left to right carefully to understand their value.",
        "Numbers can be big or small, but each one tells a certain value or amount.",
        "Use numbers to count, add, subtract, multiply, and divide in math.",
        "Look at each number and try to understand what it means in different places.",
        "Numbers help us measure, compare, and solve problems every day.",
        "Try writing numbers in different ways to practice recognizing them.",
        "Numbers are made up of digits, and each digit has a place value.",
        "Knowing numbers well helps you in math and in real life.",
        "Numbers can be used to tell time, measure weight, or count money."
    ],
    "place value": [
        "Place value tells us how much each digit in a number is worth depending on its position.",
        "In 23, the 2 means twenty because it is in the tens place, and the 3 is in the ones place.",
        "Each digit in a number has a special value. Try saying what each digit means in a number.",
        "Look at the place of each digit — ones, tens, hundreds — to know its value.",
        "Place value helps us understand numbers better and how to read them correctly.",
        "Try breaking numbers apart by place value to see what each part is worth.",
        "Place value is important for adding and subtracting bigger numbers.",
        "Practice finding the place value of digits in different numbers.",
        "Knowing place value helps you understand how numbers grow bigger or smaller.",
        "Use place value to help with reading, writing, and comparing numbers."
    ],
    "roman numeral": [
        "Roman numerals use letters like I, V, and X to show numbers instead of digits.",
        "Look at the letters in Roman numerals and add or subtract their values to find the number.",
        "Roman numerals are like secret codes for numbers. Can you decode what they mean?",
        "Try matching each Roman numeral letter to a number and adding them up carefully.",
        "Roman numerals show numbers differently, but we can learn to read and write them!",
        "Some letters like I, X, and C can be combined in different ways to form many numbers.",
        "Roman numerals don’t use zero, so counting works differently than with regular numbers.",
        "Practice writing simple numbers like I, V, X, L, C, D, and M in Roman numerals.",
        "Try reading Roman numerals on clocks, books, or monuments to see them in real life.",
        "Learning Roman numerals helps you understand history and how numbers were used long ago."
    ],
    "compare": [
        "Comparing numbers means finding out which number is bigger, smaller, or if they are the same.",
        "Look carefully at numbers to see which one is greater or less than the other.",
        "Use words like 'greater than,' 'less than,' or 'equal to' when comparing numbers.",
        "Try lining up numbers from smallest to biggest to compare them easily.",
        "Comparing helps us decide which number is larger, smaller, or if two numbers are equal.",
        "Use symbols like > (greater than), < (less than), and = (equal to) to compare numbers.",
        "Practice comparing numbers by looking at their digits and place values.",
        "When numbers have the same digits, compare their place values starting from the left.",
        "Comparing numbers helps in real life, like deciding who has more money or points.",
        "Try comparing numbers using objects or pictures to make it fun and easy."
    ],
    "greater": [
        "Greater than means one number is bigger than another number.",
        "The symbol > shows 'greater than.' Look which number is bigger and put it first.",
        "Try to find the bigger number when comparing two or more numbers.",
        "When you see greater than, the bigger number goes before the symbol, like 5 > 3.",
        "Use greater than to compare numbers and find which one is larger.",
        "Remember, the symbol > looks like an open mouth that always 'eats' the bigger number first.",
        "Practice using greater than in different math problems and real-life situations.",
        "Try reading the symbol > as 'is greater than' when you see it in math.",
        "Greater than helps you order numbers from biggest to smallest.",
        "Use greater than when comparing scores, ages, or quantities."
    ],
    "less": [
        "Less than means one number is smaller than another number.",
        "The symbol < shows 'less than.' Look which number is smaller and put it first.",
        "Try to find the smaller number when comparing two or more numbers.",
        "When you see less than, the smaller number goes before the symbol, like 2 < 6.",
        "Use less than to compare numbers and find which one is smaller.",
        "Remember, the symbol < looks like an open mouth that always 'eats' the bigger number, so the smaller number goes first.",
        "Practice using less than in math problems and real-life examples.",
        "Try reading the symbol < as 'is less than' when you see it in math.",
        "Less than helps you order numbers from smallest to biggest.",
        "Use less than when comparing prices, heights, or amounts."
    ],

    "equal": [
        "Equal means two numbers are the same.",
        "The symbol = shows equal. Both sides have the same value.",
        "Try checking if two numbers are the same or not.",
        "Equal means no difference between numbers.",
        "Use equal to show when numbers match exactly."
    ],
    "word problem": [
        "Word problems tell a story with numbers to solve.",
        "Try reading carefully and find what the question asks.",
        "Look for numbers and keywords in the story.",
        "Break the problem into small parts to understand it.",
        "Use drawings or objects to help solve word problems."
    ],
    "how many": [
        "When a question asks 'how many', count carefully.",
        "Try to find the total number of objects or items.",
        "Look at the problem and see what needs to be counted.",
        "Counting helps answer 'how many' questions easily.",
        "Use your fingers or objects to help count and answer."
    ],
    "left": [
        "Left means what remains after some are taken away.",
        "Try counting what is left after sharing or subtracting.",
        "Look for the word 'left' to know you should subtract.",
        "Use subtraction to find out how many are left.",
        "Imagine taking away some toys, how many are left?"
    ],
    "more": [
        "More means you add to get a bigger number.",
        "Try adding when you see the word 'more' in a problem.",
        "Look for how many more things there are.",
        "Adding helps you find out how many you have in total.",
        "Use addition to find out how much more you get."
    ],
    "fewer": [
        "Fewer means less or a smaller number.",
        "Try subtracting when you see the word 'fewer'.",
        "Look for what is taken away or less in the problem.",
        "Subtracting helps you find how many fewer there are.",
        "Use subtraction to find the smaller amount."
    ],
    "counting forward": [
        "Counting forward means saying numbers from small to big.",
        "Try starting at a number and counting up one by one.",
        "Counting forward helps you add or find next numbers.",
        "Use your fingers to count forward slowly and clearly.",
        "Practice counting forward to get better at numbers."
    ],
    "skip counting": [
        "Skip counting means counting by 2s, 5s, or 10s.",
        "Try jumping numbers like 2, 4, 6 or 5, 10, 15.",
        "Skip counting helps you count faster in groups.",
        "Practice skip counting to help with multiplication.",
        "Use skip counting to find patterns in numbers."
    ],
    "counting backwards": [
        "Counting backwards means saying numbers from big to small.",
        "Try starting at a number and counting down one by one.",
        "Counting backwards helps with subtraction.",
        "Use your fingers to count backwards slowly and carefully.",
        "Practice counting backwards to get better at numbers."
    ],
    "borrowing": [
        "Borrowing means taking from the next place value to subtract.",
        "Try borrowing when the top number is smaller than the bottom one.",
        "Borrowing helps you subtract bigger numbers easily.",
        "Imagine borrowing blocks from the next place to help subtract.",
        "Practice borrowing to solve tricky subtraction problems."
    ],
    "regrouping": [
        "Regrouping means moving values between places to add or subtract.",
        "Try regrouping when numbers are too big to handle in one place.",
        "Regrouping helps you add or subtract correctly with big numbers.",
        "Think of regrouping like exchanging blocks from tens to ones.",
        "Practice regrouping to make adding and subtracting easier."
    ],
    "long division": [
        "Long division means dividing big numbers step by step.",
        "Try breaking the number into smaller parts to divide.",
        "Long division helps you divide numbers that don’t fit easily.",
        "Use long division to find how many times one number goes into another.",
        "Practice long division with small steps and take your time."
    ],
    "reading roman numerals": [
        "Reading Roman numerals means knowing what letters like I, V, and X mean.",
        "Try matching Roman numerals to numbers and adding or subtracting.",
        "Roman numerals are special number letters used long ago.",
        "Practice reading Roman numerals by learning each letter’s value.",
        "Use Roman numerals to read numbers in a fun way."
    ],
    "converting roman numerals": [
        "Converting Roman numerals means changing letters to regular numbers.",
        "Try adding or subtracting values when converting Roman numerals.",
        "Practice converting by learning the value of each letter first.",
        "Use clues in the Roman numerals to find the right number.",
        "Converting Roman numerals is like solving a number puzzle."
    ],
    "ones": [
        "Ones place means how many single items there are.",
        "Look at the digit in the ones place to know its value.",
        "Ones are the smallest place value in numbers.",
        "Try saying the value of the ones digit in a number.",
        "Use the ones place to help read and understand numbers."
    ],
    "tens": [
        "Tens place means how many groups of ten there are.",
        "Look at the digit in the tens place to know its value.",
        "Each digit in tens means ten times that number.",
        "Try saying the value of the tens digit in a number.",
        "Use the tens place to help read and understand numbers."
    ],
    "hundreds": [
        "Hundreds place means how many groups of one hundred there are.",
        "Look at the digit in the hundreds place to know its value.",
        "Each digit in hundreds means one hundred times that number.",
        "Try saying the value of the hundreds digit in a number.",
        "Use the hundreds place to help read and understand numbers."
    ],
    "thousands": [
        "Thousands place means how many groups of one thousand there are.",
        "Look at the digit in the thousands place to know its value.",
        "Each digit in thousands means one thousand times that number.",
        "Try saying the value of the thousands digit in a number.",
        "Use the thousands place to help read and understand numbers."
    ],
    "ten thousands": [
        "Ten thousands place means how many groups of ten thousand there are.",
        "Look at the digit in the ten thousands place to know its value.",
        "Each digit in ten thousands means ten thousand times that number.",
        "Try saying the value of the ten thousands digit in a number.",
        "Use the ten thousands place to help read and understand numbers."
    ],

}




def get_random_tip(user_message: str) -> str:


    user_message_lower = user_message.lower()

    replacements = {
        "x": " multiply ",
        "*": " multiply ",
        "+": " add ",
        "-": " subtract ",
        "÷": " divide ",
        "/": " divide ",
        "%": " modulo ",
        ">": " greater than ",
        "<": " less than ",
        "=": " equal "
    }

    for symbol, word in replacements.items():
        user_message_lower = user_message_lower.replace(symbol, word)

    print("Normalized message:", user_message_lower)

    tokens = re.findall(r"\b\w+\b", user_message_lower)
    print("Tokens:", tokens)

    multi_word_keywords = [kw for kw in keyword_synonyms.keys() if " " in kw]
    print("Multi-word keywords:", multi_word_keywords)

    for mw_key in multi_word_keywords:
        if mw_key in user_message_lower:
            print("Matched multi-word keyword:", mw_key)
            canonical_key = keyword_synonyms[mw_key]
            tips = tips_per_topic.get(canonical_key)
            if tips:
                return random.choice(tips)

    for token in tokens:
        if token in keyword_synonyms:
            canonical_key = keyword_synonyms[token]
            tips = tips_per_topic.get(canonical_key)
            if tips:
                return random.choice(tips)
        elif token in tips_per_topic:
            # token is canonical key itself
            tips = tips_per_topic.get(token)
            if tips:
                return random.choice(tips)


    print("No keywords matched, returning generic tip.")
    generic_tips = [
        "Let's try to understand the problem step by step. Would you like more help?",
        "Math can be fun if we break it down together. Need some help?",
        "Take it one step at a time. Want me to guide you?",
        "Try to look at each number carefully. Need some help?",
        "Don't worry, I'm here to help you understand. Would you like more help?"
    ]
    return random.choice(generic_tips)



@app.route('/chatbot-api', methods=['POST'])
def chatbot_api():
    data = request.json
    user_message = data.get("message", "").strip().lower()

    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    # Initialize session variables if missing
    if 'last_question' not in session:
        session['last_question'] = ""
    if 'step' not in session:
        session['step'] = 0
    if 'expected_answer' not in session:
        session['expected_answer'] = None
    if 'tip_sent' not in session:
        session['tip_sent'] = False  # track if tip sent in step 1

    # Step 0: Greeting or math question detection
    if session['step'] == 0:
        if user_message in allowed_interactions:
            friendly_responses = {
                "hello": "Hello! I'm Counticus, your friendly math helper!",
                "hi": "Hello! I'm Counticus, your friendly math helper!",
                "hey": "Hey! I'm here if you need help with math.",
                "good morning": "Good morning! I'm here to help with math problems.",
                "good afternoon": "Good afternoon! Ready to learn some math?",
                "good evening": "Good evening! Counticus at your service!",
                "thank you": "You're welcome!",
                "thanks": "No problem!",
                "ty": "You're welcome!",
                "ok": "Okay!",
                "okay": "Okay!",
                "sure": "Okay! Just send me a math question when you're ready.",
                "alright": "Alright! I'm here when you need help."
            }
            return jsonify({"reply": friendly_responses.get(user_message, "I'm here to help with math!")})

        if not is_math_question(user_message):
            return jsonify({"reply": "Sorry, I can only help with math questions only."})

        # Save question and expected answer, then move to step 1
        session['last_question'] = user_message
        session['expected_answer'] = compute_answer(user_message)
        session['step'] = 1
        session['tip_sent'] = False  # reset tip sent flag for new question

    if session['step'] == 1:
        if user_message in yes_responses:
            session['step'] = 2
            session['tip_sent'] = False
        elif user_message in no_responses:
            session['step'] = 0
            session['last_question'] = ""
            session['expected_answer'] = None
            session['tip_sent'] = False
            return jsonify({"reply": "Alright! Let me know if you have another math question."})
        else:
            if not session.get('tip_sent', False):
                try:
                    # Use your own tip function instead of OpenAI call
                    tip_reply = get_random_tip(session.get('last_question', ''))

                    # Just in case tip too long, truncate or fallback
                    if len(tip_reply) > 300:
                        tip_reply = (
                            "Hi! When you add numbers, you just put them together. "
                            "For example, if you have 1 apple and 1 more apple, how many apples do you have? "
                            "Try counting them one by one! "
                            "Would you like more help?"
                        )

                    final_reply = f"{tip_reply}\n\n👇 Please answer YES or NO 👇"
                    session['tip_sent'] = True
                    return jsonify({"reply": final_reply})

                except Exception:
                    session['tip_sent'] = True
                    return jsonify({"reply": (
                        "Hi! When you add numbers, you just put them together. "
                        "For example, if you have 1 apple and 1 more apple, how many apples do you have? "
                        "Try counting them one by one! "
                        "Would you like more help?\n\n👇 Please answer YES or NO 👇"
                    )})
            else:
                return jsonify({"reply": "I'm sorry, I can't understand that.\n\nPlease reply with YES or NO only."})


    # Step 2: Provide step-by-step solution without final answer, then ask for user's answer
    if session['step'] == 2:
        emoji_response = emoji_math(session['last_question'])
        if emoji_response:
            session['step'] = 2.5
            return jsonify({"reply": f"{emoji_response}\n\nWhat do you think the answer is?"})

        step_prompt = f"Give a step-by-step solution without the final answer for this math problem: '{session['last_question']}'. Then ask: 'What do you think the answer is?'"
        try:
            system_prompt = "You are Counticus, a friendly Grade 1 math tutor."
            response = openai.ChatCompletion.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": step_prompt}
                ]
            )
            reply = response['choices'][0]['message']['content']
        except Exception as e:
            return jsonify({"error": str(e)}), 500

        session['step'] = 2.5
        return jsonify({"reply": reply})

    # Step 2.5: Check user's answer, if correct reset else ask if want full explanation
    if session['step'] == 2.5:
        expected = session.get('expected_answer')
        if expected is None:
            session['step'] = 3
        else:
            if check_answer(user_message, expected):
                session['step'] = 0
                session['last_question'] = ""
                session['expected_answer'] = None
                session['tip_sent'] = False
                return jsonify({"reply": "That's correct! Great job! 🎉 Let me know if you want to try another question."})
            else:
                session['step'] = 3
                return jsonify({"reply": "That's not quite right. Would you like me to explain the full solution?\n\nPlease answer YES or NO"})

    # Step 3: Provide full solution if asked
    if session['step'] == 3:
        if user_message in yes_responses:
            full_prompt = (
                f"Give a full step-by-step solution including the final answer "
                f"for this math problem: '{session['last_question']}'. "
                f"Keep it short and friendly for Grade 1. "
                f"End the explanation with the final answer clearly stated at the bottom in bold."
            )
            try:
                system_prompt = "You are Counticus, a friendly Grade 1 math tutor."
                response = openai.ChatCompletion.create(
                    model="gpt-3.5-turbo",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": full_prompt}
                    ]
                )
                reply = response['choices'][0]['message']['content']

                # Remove any "The answer is ..." lines to avoid duplication
                reply = re.sub(r"(The answer is\s*[0-9]+\.?)", "", reply, flags=re.IGNORECASE).strip()

                # Add consistent final answer line at the bottom if expected_answer is set
                if session.get("expected_answer") is not None:
                    reply += f"\n\n**Final Answer: {session['expected_answer']}**"

            except Exception as e:
                return jsonify({"error": str(e)}), 500

            # Reset session state
            session['step'] = 0
            session['last_question'] = ""
            session['expected_answer'] = None
            session['tip_sent'] = False

            return jsonify({"reply": reply})

        elif user_message in no_responses:
            # Reset on no explanation request
            session['step'] = 0
            session['last_question'] = ""
            session['expected_answer'] = None
            session['tip_sent'] = False
            return jsonify({"reply": "Okay! Feel free to ask me another math question anytime."})

        else:
            return jsonify({
                "reply": "Sorry, your answer is not wrong or not valid. "
                        "Please reply with 'YES' or 'NO' if you want the full explanation."
            })

    # Default fallback
    return jsonify({"reply": "Sorry, I didn't understand that. Please ask a math question or say hello!"})





@app.route('/reset-chat-session', methods=['POST'])
def reset_chat_session():
    keys_to_clear = ['last_question', 'step', 'expected_answer', 'tip_sent']
    for key in keys_to_clear:
        session.pop(key, None)
    return jsonify({"message": "Chat session reset"})




@app.route('/chatbot')
@login_required
def chatbot():
    return render_template('chatbot.html')

@app.route('/stages')
@login_required
def stages():
    # Retrieve the selected map from the URL query parameters
    selected_map = request.args.get('map', None)  # Get the selected map (e.g., multiplication)
    selected_stage = request.args.get('stage', '1')  # Default to stage 1 if no stage is specified
    return render_template('stages.html', selected_map=selected_map, selected_stage=selected_stage)

@app.route('/dashboard')
@login_required
def dashboard():
    user = get_user_from_db()  # Fetch user from database
    if not user:
        flash('User not found or not logged in.', 'danger')
        return redirect(url_for('login'))

    # Pass first_name, last_name, gender, and id to the template
    return render_template('dashboard.html', 
                           first_name=user['first_name'], 
                           last_name=user['last_name'], 
                           gender=user['gender'], 
                           id=user['id'])


@app.route('/roadmap')
@login_required
def roadmap():
    return render_template('roadmap.html')

@app.route('/shop')
@login_required
def shop():
    return render_template('shop.html')

@app.route('/settings')
def settings():
    return render_template('settings.html')

import json
from flask import redirect, session, render_template

@app.route('/collectibles')
@login_required
def collectibles():
    user_id = session.get('user_id')  # Get user_id from session or other source

    if not user_id:
        # Redirect to login or show error if user not logged in
        return redirect('/login')

    try:
        cursor = db.cursor()
        cursor.execute("SELECT skin_code FROM user_skins WHERE user_id = %s AND claimed = 1", (user_id,))
        claimed_skins = cursor.fetchall()
        claimed_skin_ids = [skin[0] for skin in claimed_skins]

        # Debugging outputs
        print("Claimed skins from DB:", claimed_skins)
        print("Claimed skin IDs:", claimed_skin_ids)

        cursor.close()
    except Exception as e:
        print("Error fetching skins:", e)
        claimed_skin_ids = []

    # Convert to JSON for passing to JavaScript
    claimed_skin_ids_json = json.dumps(claimed_skin_ids)

    return render_template('collectibles.html', claimed_skin_ids_json=claimed_skin_ids_json)







@app.route('/monster_atlas')
@login_required
def monster_atlas():
    return render_template('monster_atlas.html')

@app.route('/logout')
def logout():
    session.clear()  # This removes all session data, including 'user_id'
    flash('You have been logged out.', 'info')
    return redirect(url_for('login'))



@app.route('/game', methods=['GET'])
@login_required
def game():
    user_id = 1  # Hardcoded user ID

    # Get selected map and stage from query parameters
    selected_map = request.args.get('map', '')
    selected_stage = request.args.get('stage', '')

    # Get user's first name
    cursor.execute("SELECT first_name FROM users WHERE id = %s", (user_id,))
    user_row = cursor.fetchone()
    first_name = user_row['first_name'] if user_row and 'first_name' in user_row else "PLAYER"

    # Render the game template with the necessary context
    return render_template(
        'game.html',
        first_name=first_name,
        selected_map=selected_map,
        selected_stage=selected_stage
    )

@app.route('/save_progress', methods=['POST'])
def save_progress():
    if not session.get('user_id'):
        return jsonify({"error": "Not logged in"}), 403  # Unauthorized if not logged in

    user_id = session['user_id']
    data = request.get_json()

    map_name = data.get('map')
    stage_number = data.get('stage')
    stars = data.get('stars')

    if not map_name or not stage_number or stars is None:
        return jsonify({"error": "Missing data"}), 400

    cursor.execute("""
        SELECT * FROM user_progress 
        WHERE user_id = %s AND map_name = %s AND stage_number = %s
    """, (user_id, map_name, stage_number))
    existing_record = cursor.fetchone()

    if existing_record:
        cursor.execute("""
            UPDATE user_progress 
            SET stars = %s 
            WHERE user_id = %s AND map_name = %s AND stage_number = %s
        """, (stars, user_id, map_name, stage_number))
    else:
        cursor.execute("""
            INSERT INTO user_progress (user_id, map_name, stage_number, stars) 
            VALUES (%s, %s, %s, %s)
        """, (user_id, map_name, stage_number, stars))

    db.commit()

    return jsonify({"message": "Progress saved successfully"}), 200




@app.route('/get_stage_progress')
def get_stage_progress():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({})  # Return an empty response if the user is not logged in

    # Query to get all stage progress for the logged-in user
    cursor.execute("""
        SELECT map_name, stage_number, stars 
        FROM user_progress 
        WHERE user_id = %s
    """, (user_id,))

    rows = cursor.fetchall()

    # Prepare the stage progress in the required format
    progress = {}
    for row in rows:
        # Use a combined key for map and stage like 'subtraction-2'
        key = f"{row['map_name']}-{row['stage_number']}"
        progress[key] = {"stars": row['stars']}
    
    # Debug log to check the data structure
    print(progress)

    # Return the stage progress as JSON
    return jsonify(progress)




reward_data = {
    'multiplication': {
        1: {
            'badge': "/static/images/gameimg/rewardimg/badge/badge-1.png",
        },
        2: {
            'title': "/static/images/gameimg/rewardimg/title/title-1.png",
        },
        3: {
            'border': "/static/images/gameimg/rewardimg/border/border-1.png"
        }
    },
    'addition': {
        1: {
            'badge': "/static/images/gameimg/rewardimg/badge/badge-2.png",
        },
        2: {
            'title': "/static/images/gameimg/rewardimg/title/title-2.png",
        },
        3: {
            'border': "/static/images/gameimg/rewardimg/border/border-2.png"
        }
    },
    'subtraction': {
        1: {
            'badge': "/static/images/gameimg/rewardimg/badge/badge-3.png",
        },
        2: {
            'title': "/static/images/gameimg/rewardimg/title/title-3.png",
        },
        3: {
            'border': "/static/images/gameimg/rewardimg/border/border-3.png"
        }
    },
    'division': {
        1: {
            'badge': "/static/images/gameimg/rewardimg/badge/badge-4.png",
        },
        2: {
            'title': "/static/images/gameimg/rewardimg/title/title-4.png",
        },
        3: {
            'border': "/static/images/gameimg/rewardimg/border/border-4.png"
        }
    },
    'counting': {
        1: {
            'badge': "/static/images/gameimg/rewardimg/badge/badge-5.png",
        },
        2: {
            'title': "/static/images/gameimg/rewardimg/title/title-5.png",
        },
        3: {
            'border': "/static/images/gameimg/rewardimg/border/border-5.png"
        }
    },
    'comparison': {
        1: {
            'badge': "/static/images/gameimg/rewardimg/badge/badge-6.png",
        },
        2: {
            'title': "/static/images/gameimg/rewardimg/title/title-6.png",
        },
        3: {
            'border': "/static/images/gameimg/rewardimg/border/border-6.png"
        }
    },
    'numerals': {
        1: {
            'badge': "/static/images/gameimg/rewardimg/badge/badge-7.png",
        },
        2: {
            'title': "/static/images/gameimg/rewardimg/title/title-7.png",
        },
        3: {
            'border': "/static/images/gameimg/rewardimg/border/border-7.png"
        }
    },
    'placevalue': {
        1: {
            'badge': "/static/images/gameimg/rewardimg/badge/badge-8.png",
        },
        2: {
            'title': "/static/images/gameimg/rewardimg/title/title-8.png",
        },
        3: {
            'border': "/static/images/gameimg/rewardimg/border/border-8.png"
        }
    }
    # Add more maps and stages as needed
}

@app.route('/get_stage_reward', methods=['GET'])
def get_stage_reward():
    map_name = request.args.get('map')
    stage = request.args.get('stage')

    if not map_name or not stage:
        return jsonify({'error': 'Map and stage are required'}), 400

    try:
        stage = int(stage)
    except ValueError:
        return jsonify({'error': 'Stage must be an integer'}), 400

    if map_name not in reward_data:
        return jsonify({'error': 'Map not found'}), 404

    if stage not in reward_data[map_name]:
        return jsonify({'error': 'Stage not found for this map'}), 404

    return jsonify(reward_data[map_name][stage])



@app.route('/claim_reward', methods=['POST'])
def claim_reward():
    try:
        # Kunin ang user_id mula sa session
        user_id = session.get('user_id')
        
        # Kunin ang map_name at stage_number mula sa JSON body ng request
        map_name = request.json.get('map')
        stage_number = request.json.get('stage')

        # Siguraduhing kumpleto ang mga parameters
        if not user_id or not map_name or not stage_number:
            return jsonify({"error": "User ID, map, and stage parameters are required"}), 400
        
        print(f"Claiming reward for user_id={user_id}, map={map_name}, stage={stage_number}")

        # I-execute ang INSERT o UPDATE query sa database para i-claim ang reward
        cursor.execute("""
            INSERT INTO stage_rewards_claimed (user_id, map_name, stage_number, claimed)
            VALUES (%s, %s, %s, TRUE)
            ON DUPLICATE KEY UPDATE claimed = TRUE
        """, (user_id, map_name, stage_number))

        # I-commit ang changes sa database
        db.commit()

        print("Reward claimed successfully")
        
        # Ibalik ang success response
        return jsonify({"success": True})

    except Exception as e:
        # I-print ang error kung may mangyari
        print(f"[ERROR] /claim_reward failed: {e}")
        
        # Ibalik ang error response sa client
        return jsonify({"error": "Unable to claim reward"}), 500

@app.route('/check_reward_claimed', methods=['POST'])
def check_reward_claimed():
    try:
        db.ping(reconnect=True, attempts=3, delay=5)  # <-- reconnect if needed

        user_id = session.get('user_id')
        print(f"Session user_id: {user_id}")

        if not user_id:
            return jsonify({"error": "User not logged in"}), 400

        map_name = request.json.get('map')
        stage_number = request.json.get('stage')

        print(f"Received map: {map_name}, stage: {stage_number}")

        if not map_name or not stage_number:
            return jsonify({"error": "Map and stage are required"}), 400

        cursor.execute("""
            SELECT claimed
            FROM stage_rewards_claimed
            WHERE user_id = %s AND map_name = %s AND stage_number = %s
        """, (user_id, map_name, stage_number))

        reward_claimed = cursor.fetchone()
        print(f"DB query result: {reward_claimed}")

        if reward_claimed is None:
            return jsonify({"claimed": False})

        claimed = reward_claimed['claimed'] if isinstance(reward_claimed, dict) else reward_claimed[0]

        return jsonify({"claimed": bool(claimed)})

    except Exception as e:
        import traceback
        print(f"Error in /check_reward_claimed: {e}")
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500








@app.route('/has_claimed_skin')
def has_claimed_skin():
    user_id = session.get('user_id')
    map_param = request.args.get('map')

    if not user_id or not map_param:
        print("Error: Missing user ID or map parameter")
        return jsonify({'claimed': False, 'error': 'Missing user ID or map parameter'})

    try:
        cursor = db.cursor()  # 🔧 Fresh cursor
        cursor.execute("""
            SELECT claimed FROM user_skins WHERE user_id = %s AND map = %s
        """, (user_id, map_param))
        result = cursor.fetchone()

        if result is None:
            print(f"Error: No result found for user {user_id} and map {map_param}")
            return jsonify({'claimed': False, 'error': 'No skin data found'})

        if result[0] == 1:
            return jsonify({'claimed': True})
        else:
            return jsonify({'claimed': False})

    except Exception as e:
        print(f"Error in /has_claimed_skin: {e}")
        return jsonify({'claimed': False, 'error': str(e)})
    finally:
        cursor.close()



@app.route('/claim_skin', methods=['POST'])
def claim_skin():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': 'User not logged in'})

    data = request.get_json()
    selected_map = data.get('map')

    if not selected_map:
        return jsonify({'error': 'Missing map parameter'}), 400

    skin_code_mapping = {
        'multiplication': 'r1',
        'addition': 'r2',
        'subtraction': 'r3',
        'division': 'r4',
        'counting': 'r5',
        'comparison': 'r6',
        'numerals': 'r7',
        'placevalue': 'r8',
    }

    skin_code = skin_code_mapping.get(selected_map)

    if not skin_code:
        return jsonify({'error': 'Invalid map provided'}), 400

    try:
        print(f"User {user_id} claiming skin for map: {selected_map} => skin_code: {skin_code}")

        cursor = db.cursor()  # 🔧 Create a new cursor here

        cursor.execute("""
            SELECT claimed FROM user_skins WHERE user_id = %s AND map = %s
        """, (user_id, selected_map))
        existing_skin = cursor.fetchone()

        if existing_skin and existing_skin[0] == 1:
            return jsonify({'success': False, 'message': 'Skin already claimed by this user'})

        if existing_skin:
            cursor.execute("""
                UPDATE user_skins SET claimed = 1, skin_code = %s
                WHERE user_id = %s AND map = %s
            """, (skin_code, user_id, selected_map))
        else:
            cursor.execute("""
                INSERT INTO user_skins (user_id, map, claimed, skin_code)
                VALUES (%s, %s, 1, %s)
            """, (user_id, selected_map, skin_code))

        db.commit()
        return jsonify({'success': True, 'message': 'Skin claimed successfully'})

    except Exception as e:
        print(f"Error in /claim_skin: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        cursor.close()  # Close this route's cursor only

@app.route('/get_user_skins')
def get_user_skins():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'User not logged in'}), 401

    cursor = None
    try:
        cursor = db.cursor()

        # Fetch claimed skins
        cursor.execute("""
            SELECT map, skin_code FROM user_skins WHERE user_id = %s AND claimed = 1
        """, (user_id,))
        skins = cursor.fetchall()

        # Get the equipped skin
        cursor.execute("""
            SELECT skin_code FROM user_skins WHERE user_id = %s AND equipped = 1 LIMIT 1
        """, (user_id,))
        equipped = cursor.fetchone()
        equipped_skin = equipped[0] if equipped else 'default'

        # Return skins data with equipped skin info
        return jsonify({
            'skins': [{'skin_code': skin[1], 'map': skin[0]} for skin in skins],
            'equipped_skin': equipped_skin
        })

    except Exception as e:
        print(f"Error fetching user skins: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if cursor:
            cursor.close()





@app.route('/update_equipped_skin', methods=['POST'])
def update_equipped_skin():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'User not logged in'}), 401
    
    skin_id = request.json.get('skin_id')
    if skin_id is None:
        return jsonify({'error': 'Skin ID is required'}), 400

    try:
        cursor = db.cursor()

        # Allow 'default' skin
        if skin_id != 'default':
            cursor.execute("""
                SELECT * FROM user_skins WHERE user_id = %s AND skin_code = %s
            """, (user_id, skin_id))
            skin = cursor.fetchone()

            if not skin:
                return jsonify({'error': 'Skin not found for this user'}), 404

        # Unequip all skins first
        cursor.execute("""
            UPDATE user_skins SET equipped = 0 WHERE user_id = %s
        """, (user_id,))

        # Equip selected skin
        cursor.execute("""
            UPDATE user_skins SET equipped = 1 WHERE user_id = %s AND skin_code = %s
        """, (user_id, skin_id))

        # If no row was updated, insert the default skin
        if cursor.rowcount == 0 and skin_id == 'default':
            cursor.execute("""
                INSERT INTO user_skins (user_id, skin_code, map, claimed, equipped)
                VALUES (%s, 'default', NULL, 1, 1)
            """, (user_id,))

        db.commit()
        return jsonify({'message': 'Skin equipped successfully'})

    except Exception as e:
        print(f"Error equipping skin: {e}")
        db.rollback()
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        cursor.close()




def get_db_connection():
    try:
        return mysql.connector.connect(
            host=os.getenv("DB_HOST"),
            port=int(os.getenv("DB_PORT", 3306)),  # optional default
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME")
        )
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return None

@app.route('/get-progress')
def get_progress():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': 'User not logged in'}), 400

    db = get_db_connection()
    if db is None:
        return jsonify({'success': False, 'message': 'Failed to connect to database'}), 500

    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute("SELECT * FROM user_game_progress WHERE user_id = %s", (user_id,))
        rows = cursor.fetchall()

        if not rows:
            cursor.execute("""
                INSERT INTO user_game_progress (user_id, map, stage_key, correct, wrong, total, difficulty)
                VALUES (%s, 'multiplication', 'stage1', 0, 0, 0, 'easy')
            """, (user_id,))
            db.commit()

            cursor.execute("SELECT * FROM user_game_progress WHERE user_id = %s", (user_id,))
            rows = cursor.fetchall()

        result = {'success': True, 'mapDifficulty': {}, 'selectedMap': 'multiplication', 'selectedStageKey': 'stage1'}

        for row in rows:
            map_name = row['map']
            result['mapDifficulty'][map_name] = row['difficulty']
            result[map_name] = {
                'correctAnswersCount': row['correct'],
                'wrongAnswersCount': row['wrong'],
                'totalQuestionsAnswered': row['total']
            }

        return jsonify(result)
    
    except Exception as e:
        print(f"Error loading progress: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        db.close()

@app.route('/save-game-progress', methods=['POST'])
def save_game_progress():
    try:
        data = request.get_json()
        user_id = session.get('user_id')

        if not user_id:
            raise ValueError("User not logged in")

        selected_map = data.get('map')
        selected_stage = data.get('stage')
        correct = data.get('correctAnswersCount', 0)
        wrong = data.get('wrongAnswersCount', 0)
        total = data.get('totalQuestionsAnswered', 0)
        difficulty = data.get('difficulty')

        db = get_db_connection()
        if db is None:
            raise ConnectionError("Failed to connect to the database")
        
        cursor = db.cursor()

        cursor.execute("""
            INSERT INTO user_game_progress (user_id, map, stage_key, correct, wrong, total, difficulty)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
            correct = VALUES(correct),
            wrong = VALUES(wrong),
            total = VALUES(total),
            difficulty = VALUES(difficulty)
        """, (user_id, selected_map, selected_stage, correct, wrong, total, difficulty))
        
        db.commit()
        
        return jsonify({'success': True, 'message': 'Progress saved successfully'})

    except ValueError as ve:
        print(f"ValueError: {ve}")
        return jsonify({'success': False, 'message': str(ve)}), 400  # Bad request
    except ConnectionError as ce:
        print(f"ConnectionError: {ce}")
        return jsonify({'success': False, 'message': str(ce)}), 500  # Internal server error
    except mysql.connector.Error as mysql_err:
        print(f"MySQL Error: {mysql_err}")
        return jsonify({'success': False, 'message': 'Database error occurred'}), 500  # Internal server error
    except Exception as e:
        print(f"Exception: {e}")
        return jsonify({'success': False, 'message': 'An unexpected error occurred'}), 500  # Generic server error
    finally:
        if db:
            db.close()


@app.route('/get-difficulty')
def get_difficulty():
    user_id = session.get('user_id')
    map_name = request.args.get('map')

    db = get_db_connection()
    if db is None:
        return jsonify({'success': False, 'message': 'Failed to connect to database'}), 500

    cursor = db.cursor()
    cursor.execute("SELECT difficulty FROM user_game_progress WHERE user_id = %s AND map = %s", (user_id, map_name))
    result = cursor.fetchone()

    if result:
        return jsonify({'success': True, 'difficulty': result[0]})
    return jsonify({'success': False})

@app.route('/update-difficulty', methods=['POST'])
def update_difficulty():
    data = request.json
    user_id = session.get('user_id')
    map_name = data['map']
    difficulty = data['difficulty']

    db = get_db_connection()
    if db is None:
        return jsonify({'success': False, 'message': 'Failed to connect to database'}), 500

    cursor = db.cursor()
    cursor.execute("""
        UPDATE user_game_progress SET difficulty = %s WHERE user_id = %s AND map = %s
    """, (difficulty, user_id, map_name))

    db.commit()
    return jsonify({'success': True})


@app.route('/reset-counters', methods=['POST'])
def reset_counters():
    data = request.get_json()
    user_id = session.get('user_id')  # Make sure user is logged in
    selected_map = data.get('map')

    if not user_id or not selected_map:
        return jsonify({"message": "Missing user ID or map"}), 400

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        reset_query = """
            UPDATE user_game_progress
            SET correct = 0,
                wrong = 0,
                total = 0
            WHERE user_id = %s AND map = %s
        """

        print(f"Executing query: {reset_query} with params: (user_id={user_id}, map={selected_map})")

        cursor.execute(reset_query, (user_id, selected_map))
        connection.commit()

        if cursor.rowcount > 0:
            return jsonify({"message": "Counters reset successfully!"}), 200
        else:
            return jsonify({"message": "No progress found for this map."}), 404

    except Exception as e:
        connection.rollback()
        print("❌ Error resetting counters:", str(e))
        return jsonify({"message": "Error resetting counters", "error": str(e)}), 500

    finally:
        cursor.close()
        connection.close()



@app.route('/api/tutorial-status')
def tutorial_status():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'tutorial_done': False})

    tutorial_key = request.args.get('tutorialKey')
    if not tutorial_key:
        return jsonify({'error': 'Missing tutorialKey parameter'}), 400

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT completed FROM user_tutorials
        WHERE user_id = %s AND tutorial_key = %s
    """, (user_id, tutorial_key))
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if not row:
        # No record means tutorial not completed yet
        return jsonify({'tutorial_done': False})

    return jsonify({'tutorial_done': bool(row['completed'])})


@app.route('/api/tutorial-complete', methods=['POST'])
def tutorial_complete():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401

    data = request.get_json()
    tutorial_key = data.get('tutorialKey') if data else None
    if not tutorial_key:
        return jsonify({'success': False, 'error': 'Missing tutorialKey'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    # Upsert pattern: Insert or update if exists
    cursor.execute("""
        INSERT INTO user_tutorials (user_id, tutorial_key, completed, completed_at)
        VALUES (%s, %s, 1, NOW())
        ON DUPLICATE KEY UPDATE completed = 1, completed_at = NOW()
    """, (user_id, tutorial_key))

    conn.commit()
    cursor.close()
    conn.close()

    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True)

    