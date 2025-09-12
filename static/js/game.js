let animationInterval = null;

// === Step 1: Get URL Params ===
const urlParams = new URLSearchParams(window.location.search);
let selectedMap = urlParams.get('map') || 'multiplication';
let selectedStage = parseInt(urlParams.get('stage'), 10) || 1;
let selectedStageKey = 'stage' + selectedStage;

// === Default Difficulty per Map ===
let mapDifficulty = {
  multiplication: 'easy',
  addition: 'easy',
  subtraction: 'easy',
  division: 'easy',
  counting: 'easy',
  comparison: 'easy',
  numerals: 'easy',
  placevalue: 'easy',
};

// === Load Difficulty ===
let currentDifficulty = loadDifficultyForMap(selectedMap);

// === INITIAL LOAD ===
window.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([
    loadProgress(),  // Load progress asynchronously
    fetchNewQuestion()  // Fetch new question asynchronously
  ]);
  
  initMapAndStage();
  updateHealthBars();
  
  // console.log(`Selected Map: ${selectedMap}`);
  // console.log(`Selected Stage: ${selectedStageKey}`);
  // console.log(`Current Difficulty: ${currentDifficulty}`);
});




// === Progress Functions ===
async function loadProgress() {
  try {
    const response = await fetch('/get-progress');
    const data = await response.json();

    if (data.success) {
      if (!urlParams.get('map')) {
        selectedMap = data.selectedMap || selectedMap;
      }

      if (!urlParams.get('stage')) {
        selectedStageKey = data.selectedStageKey || selectedStageKey;
      }

      if (data.mapDifficulty) {
        mapDifficulty = data.mapDifficulty;
      }

      if (data[selectedMap]) {
        const progress = data[selectedMap];
        correctAnswersCount = progress.correctAnswersCount || 0;
        wrongAnswersCount = progress.wrongAnswersCount || 0;
        totalQuestionsAnswered = progress.totalQuestionsAnswered || 0;

        console.log(`📝 Loaded DB progress for ${selectedMap}: Correct: ${correctAnswersCount}, Wrong: ${wrongAnswersCount}, Total: ${totalQuestionsAnswered}`);
      }
    }
  } catch (error) {
    console.error("❌ Failed to load progress from DB:", error);
  }
}





// === Saving Progress ===
async function saveProgress() {
  const data = {
      map: selectedMap,  // Ensure this is properly set before the POST request
      stage: selectedStage,
      correctAnswersCount: correctAnswersCount,
      wrongAnswersCount: wrongAnswersCount,  // Correct variable name
      totalQuestionsAnswered: totalQuestionsAnswered,
      difficulty: currentDifficulty,
  };

  console.log("Sending data:", data);  // Log data for debugging

  try {
      const response = await fetch('/save-game-progress', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
      });

      const result = await response.json();
      if (result.success) {
          // console.log("Progress saved successfully");
      } else {
          console.error("Failed to save progress:", result.message);
      }
  } catch (error) {
      console.error("Error saving progress:", error);
  }
}





async function switchMap(newMap) {
  // Save current map progress first
  await saveProgress();

  console.log(`🔄 Switching from ${selectedMap} to ${newMap}`);

  // Update selectedMap variable
  selectedMap = newMap;

  // Update the URL param 'map' so other logic (like BGM) knows the current map
  const url = new URL(window.location);
  url.searchParams.set('map', newMap);
  window.history.replaceState({}, '', url);

  // Update background music based on new map
  initBackgroundMusic();

  // Load progress for the new map
  await loadProgress();

  // Fetch new question for the new map
  await fetchNewQuestion();
}








async function loadDifficultyForMap(mapName) {
  try {
    const response = await fetch(`/get-difficulty?map=${mapName}`);
    const data = await response.json();

    if (data.success) {
      // console.log(`✅ Loaded difficulty for ${mapName}: ${data.difficulty}`);
      currentDifficulty = data.difficulty;
      updateDifficultyDisplay();  // Update the difficulty display
      return data.difficulty;
    } else {
      currentDifficulty = mapDifficulty[mapName]; // fallback
      updateDifficultyDisplay();  // Update the difficulty display
      return mapDifficulty[mapName];
    }
  } catch (error) {
    console.error(`❌ Failed to load difficulty for ${mapName}:`, error);
    currentDifficulty = mapDifficulty[mapName];
    updateDifficultyDisplay();  // Update the difficulty display
    return mapDifficulty[mapName];
  }
}

function updateDifficultyDisplay() {
  const difficultyDisplay = document.getElementById('difficulty-display');
  difficultyDisplay.style.display = 'block'; // Make the display visible

  // Set the text and class based on current difficulty
  difficultyDisplay.innerText = `Difficulty: ${currentDifficulty.charAt(0).toUpperCase() + currentDifficulty.slice(1)}`;
  difficultyDisplay.classList.remove('easy', 'normal', 'hard', 'extreme');
  difficultyDisplay.classList.add(currentDifficulty);
}

// === Difficulty Evaluation ===
function evaluateDifficulty(correctAnswers, totalQuestionsAnswered) {
  if (totalQuestionsAnswered >= 10) {
    // console.log(`Evaluating difficulty... Correct: ${correctAnswers}, Total: ${totalQuestionsAnswered}`);

    if (correctAnswers >= 8) {
      console.log("✅ Increasing difficulty");
      return getNextDifficulty(currentDifficulty);  // Increase difficulty
    }
    if (correctAnswers >= 5) {
      console.log("✅ Staying at current difficulty");
      return currentDifficulty; // Stay the same
    }
    console.log("✅ Decreasing difficulty");
    return getPreviousDifficulty(currentDifficulty); // Decrease difficulty
  }
  return currentDifficulty;  // If we haven't reached 10 questions, return current difficulty
}

// Get next difficulty level
function getNextDifficulty(currentDifficulty) {
  if (!['easy', 'normal', 'hard', 'extreme'].includes(currentDifficulty)) {
    console.error("Invalid currentDifficulty:", currentDifficulty);
    return 'easy';  // Default to 'easy' if the difficulty is invalid
  }
  const levels = ['easy', 'normal', 'hard', 'extreme'];
  const index = levels.indexOf(currentDifficulty);
  return levels[Math.min(index + 1, levels.length - 1)];
}

// Get previous difficulty level
function getPreviousDifficulty(currentDifficulty) {
  if (!['easy', 'normal', 'hard', 'extreme'].includes(currentDifficulty)) {
    console.error("Invalid currentDifficulty:", currentDifficulty);
    return 'easy';  // Default to 'easy' if the difficulty is invalid
  }
  const levels = ['easy', 'normal', 'hard', 'extreme'];
  const index = levels.indexOf(currentDifficulty);
  return levels[Math.max(index - 1, 0)];
}


// === Question Fetching ===
let askedQuestions = new Set();  // Store indices of questions already asked

async function fetchNewQuestion() {
  const qText = document.getElementById('question-text');
  const cAns = document.getElementById('correct-answer');
  const fb = document.getElementById('feedback');

  // Await for difficulty to be loaded asynchronously
  currentDifficulty = await loadDifficultyForMap(selectedMap);

  if (!questions[selectedMap] || !questions[selectedMap][selectedStageKey]) {
    console.error("❌ No questions available for the selected map or stage.");
    return;
  }

  const stageQuestions = questions[selectedMap][selectedStageKey][currentDifficulty];
  if (stageQuestions && stageQuestions.length > 0) {
    
    // Reset askedQuestions if all questions have been asked
    if (askedQuestions.size >= stageQuestions.length) {
      askedQuestions.clear();
    }

    let randomIndex;
    let attempts = 0;
    const maxAttempts = 100;  // Prevent infinite loops in rare cases

    do {
      randomIndex = Math.floor(Math.random() * stageQuestions.length);
      attempts++;
    } while (askedQuestions.has(randomIndex) && attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      console.warn("Could not find a new question after many attempts. Showing a repeated one.");
    }

    askedQuestions.add(randomIndex);

    const selectedQuestion = stageQuestions[randomIndex];

    qText.innerText = selectedQuestion.question_text;
    cAns.value = selectedQuestion.correct_answer;
    fb.innerText = ''; // Clear feedback

    // Call autoResizeFont AFTER setting the question text
    setTimeout(() => {
      autoResizeFont(qText);
    }, 0);

  } else {
    console.error("❌ No questions available for this difficulty.");
    qText.innerText = 'No question available.';
    cAns.value = '';
    fb.innerText = '';
  }
}


function autoResizeFont(element) {
  let fontSize = 7; // Start with a base font size (in vh)
  element.style.fontSize = fontSize + 'vh'; // Set the initial font size

  // Shrink font until it fits or until minimum size (e.g., 2vh)
  while (element.scrollHeight > element.offsetHeight && fontSize > 2) {
    fontSize -= 0.5;  // Decrease font size by 0.5vh
    element.style.fontSize = fontSize + 'vh';  // Apply the new font size
  }
}

// === Answer Handling ===
let correctAnswersCount = 0;
let wrongAnswersCount = 0;
let totalQuestionsAnswered = 0;
const correctSfx = new Audio('/static/sfx/correct.mp3');
const wrongSfx = new Audio('/static/sfx/wrong.mp3');

async function handleAttack() {
  const input = document.getElementById('number-input').value.trim();
  const answer = document.getElementById('correct-answer').value.trim();
  const feedbackMessage = document.getElementById('feedback-message');

  if (input === '') {
    displayFeedback('Please enter a number!');
    return;
  }

  const isCorrect = parseFloat(input) === parseFloat(answer);

  // Show speech bubble
  handleAnswer(input, answer);

  // Update counters
  totalQuestionsAnswered++;

  if (isCorrect) {
    correctSfx.currentTime = 0; // Rewind to start
    correctSfx.play();
  
    fireballAttack(() => {
      decreaseFreezeTurns(); // After fireball animation
    });
    correctAnswersCount++;
  
    feedbackMessage.textContent = "✅ Correct!";
    feedbackMessage.classList.remove('wrong');
    feedbackMessage.classList.add('correct');
  } else {
    wrongSfx.currentTime = 0; // Rewind to start
    wrongSfx.play();
  
    wrongAnswersCount++;
  
    if (freezeTurns <= 0) {
      monsterAttack();
    } else {
      console.log("❄️ Monster is frozen — no damage to player.");
    }
  
    decreaseFreezeTurns();
  
    feedbackMessage.textContent = "❌ Incorrect answer!";
    feedbackMessage.classList.remove('correct');
    feedbackMessage.classList.add('wrong');
  }
  

  // Show feedback
  feedbackMessage.style.display = 'inline-block';
  feedbackMessage.classList.add('fade-in');

  setTimeout(() => {
    feedbackMessage.classList.remove('fade-in');
    feedbackMessage.classList.add('fade-out');
    setTimeout(() => {
      feedbackMessage.style.display = 'none';
    }, 500);
  }, 3000);

  // Reset wrong counter every time it hits 1
  // if (wrongAnswersCount >= 1) {
  //   wrongAnswersCount = 0;
  // }

  // === RESET COUNTERS AND UPDATE DIFFICULTY IF 10 ANSWERS ===
  if (totalQuestionsAnswered >= 10) {
    currentDifficulty = evaluateDifficulty(correctAnswersCount, totalQuestionsAnswered);
    updateDifficultyDisplay();

    // console.log("🔁 Resetting counters after 10 answers...");
    await resetCounters(); // ✅ Backend reset
    correctAnswersCount = 0; // ✅ Frontend reset
    wrongAnswersCount = 0;
    totalQuestionsAnswered = 0;
  }

  await saveProgress();

  // Fetch new question ONLY if monster is still alive
  if (isCorrect && currentMonsterHealth > 1) {
    await fetchNewQuestion();
  }

  // Clear input
  document.getElementById('number-input').value = '';
}


// === Reset Counters ===
async function resetCounters() {
  try {
    const response = await fetch('/reset-counters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ map: selectedMap })
    });

    const data = await response.json();

    if (response.ok) {
      // console.log(`✅ Counters reset: ${data.message}`);
    } else {
      console.error(`❌ Failed to reset: ${data.message}`);
    }
  } catch (error) {
    console.error("❌ Error resetting counters:", error);
  }
}




// Helper function to handle freeze turn decrement
function decreaseFreezeTurns() {
  if (freezeTurns > 0) {
    freezeTurns--;
    updateFreezeTurnsDisplay(); // Update the display to show remaining freeze turns

    // If freeze turns reach 0, remove the effect
    if (freezeTurns === 0) {
      setTimeout(() => {
        removeFreezeEffect();
        freezeTurnsDisplay.style.display = 'none';
        console.log("⏹ Freeze effect has ended.");
      }, 1100);
    }
  }
}









// === Difficulty Update Function ===
async function updateDifficulty() {
  try {
    const data = { map: selectedMap, difficulty: currentDifficulty };

    const response = await fetch('/update-difficulty', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    if (result.success) {
      console.log(`✅ Difficulty updated in DB to ${currentDifficulty}`);
    }
  } catch (error) {
    console.error("❌ Error updating difficulty:", error);
  }
}
















// === Step 4: Initialize mapDifficulty  is defined ===

let currentQuestionIndex = 0;
let correctCount = 0;
let totalQuestions = 0;

// Backgrounds per map
const mapBackgrounds = {
  multiplication: 'Multiplication Mirage.png',
  addition:       'Additroplois Village.png',
  subtraction:    'Subtraction Sands.png',
  division:       'Divide & Conquer River.png',
  counting:       'Counting Springs.png',
  comparison:     'Cliffs of Comparison.png',
  numerals:       'Numeral Ruins.png',
  placevalue:     'Place Value Town.png',
};

const mapPlatforms = {
  multiplication: 'Multiplication Mirage.png',
  addition:       'Additroplois Village.png',
  subtraction:    'Subtraction Sands.png',
  division:       'Divide & Conquer River.png',
  counting:       'Counting Springs.png',
  comparison:     'Cliffs of Comparison.png',
  numerals:       'Numeral Ruins.png',
  placevalue:     'Place Value Town.png',
};





// Monsters per map & stage
const mapStages = {
  multiplication: {
    1: [
      { name: 'Multiplication-Mob-1', displayName: "OASIS OGRES", maxHp: 3, image: 'Multiplication-Mob-1.png' },//3
      { name: 'Multiplication-Mob-2', displayName: "PRODUCT PIRANHAS", maxHp: 5, image: 'Multiplication-Mob-2.png' },//5
      { name: 'Multiplication-Mob-3', displayName: "MULTIPLEX MONKEY", maxHp: 6, image: 'Multiplication-Mob-3.png' },//6
      { name: 'Multiplication-Boss-1', displayName: "THE PRODUCT GOLEM", maxHp: 7, image: 'Multiplication-Boss-1.1.png' }//7
    ],
    2: [
      { name: 'Multiplication-Mob-4', displayName: "TIME TURTLE", maxHp: 2, image: 'Multiplication-Mob-4.png' },
      { name: 'Multiplication-Mob-5', displayName: "SERPENT SOLVER", maxHp: 4, image: 'Multiplication-Mob-5.png' },
      { name: 'Multiplication-Mob-6', displayName: "CRUNCH CROCODILE", maxHp: 5, image: 'Multiplication-Mob-6.png' },
      { name: 'Multiplication-Boss-2', displayName: "THE MULTI REX", maxHp: 7, image: 'Multiplication-Boss-2.2.png' }
    ],
    3: [
      { name: 'Multiplication-Mob-7', displayName: "ECHO ELEPANT", maxHp: 2, image: 'Multiplication-Mob-7.png' },
      { name: 'Multiplication-Mob-8', displayName: "MULTI MAGPIE", maxHp: 4, image: 'Multiplication-Mob-8.png' },
      { name: 'Multiplication-Mob-9', displayName: "WHIRL WHALE", maxHp: 6, image: 'Multiplication-Mob-9.png' },
      { name: 'Multiplication-Boss-3', displayName: "THE EQUATION BEAST", maxHp: 7, image: 'Multiplication-Boss-3.3.png' }
    ]
  },
  division: {
    1: [
      { name: 'Division-Mob-1', displayName: "DIVIDE GATOR", maxHp: 3, image: 'Division-Mob-1.png' },
      { name: 'Division-Mob-2', displayName: "RATIO LOBSTER", maxHp: 5, image: 'Division-Mob-2.png' },
      { name: 'Division-Mob-3', displayName: "SILK STRANGLERS", maxHp: 6, image: 'Division-Mob-3.png' },
      { name: 'Division-Boss-1', displayName: "THE FRACTION HOUSE", maxHp: 7, image: 'Division-Boss-1.png' }
    ],
    2: [
      { name: 'Division-Mob-4', displayName: "SPLIT PHANTOMS", maxHp: 2, image: 'Division-Mob-4.png' },
      { name: 'Division-Mob-5', displayName: "GROWTH GUARD", maxHp: 4, image: 'Division-Mob-5.png' },
      { name: 'Division-Mob-6', displayName: "TENTACLE TERROR", maxHp: 5, image: 'Division-Mob-6.png' },
      { name: 'Division-Boss-2', displayName: "THE TIDAL DRAGON", maxHp: 7, image: 'Division-Boss-2.png' }
    ],
    3: [
      { name: 'Division-Mob-7', displayName: "DEEP SEA SERPENT", maxHp: 3, image: 'Division-Mob-7.png' },
      { name: 'Division-Mob-8', displayName: "DIVIDE DEMON", maxHp: 5, image: 'Division-Mob-8.png' },
      { name: 'Division-Mob-9', displayName: "SWAMP STOMPER", maxHp: 6, image: 'Division-Mob-9.png' },
      { name: 'Division-Boss-3', displayName: "THE MURKY MAJESTY", maxHp: 7, image: 'Division-Boss-3.png' }
    ]
  },
  addition: {
    1: [
      { name: 'Addition-Mob-1', displayName: "JUNGLE VIPER", maxHp: 2, image: 'Addition-Mob-1.png' },
      { name: 'Addition-Mob-2', displayName: "MARCHING ANT", maxHp: 4, image: 'Addition-Mob-2.png' },
      { name: 'Addition-Mob-3', displayName: "MOSSBACK TURTLE", maxHp: 5, image: 'Addition-Mob-3.png' },
      { name: 'Addition-Boss-1', displayName: "THE ADD CHIEFTAIN", maxHp: 7, image: 'Addition-Boss-1.png' }
    ],
    2: [
      { name: 'Addition-Mob-4', displayName: "TRIBE WARRIOR", maxHp: 3, image: 'Addition-Mob-4.png' },
      { name: 'Addition-Mob-5', displayName: "CROWING CONDOR", maxHp: 5, image: 'Addition-Mob-5.png' },
      { name: 'Addition-Mob-6', displayName: "TREEMANCER", maxHp: 6, image: 'Addition-Mob-6.png' },
      { name: 'Addition-Boss-2', displayName: "THE SUM TITAN", maxHp: 7, image: 'Addition-Boss-2.png' }
    ],
    3: [
      { name: 'Addition-Mob-7', displayName: "JUNGLE CUB", maxHp: 2, image: 'Addition-Mob-7.png' },
      { name: 'Addition-Mob-8', displayName: "SCALY STRIKER", maxHp: 4, image: 'Addition-Mob-8.png' },
      { name: 'Addition-Mob-9', displayName: "TREETOP TALONS", maxHp: 5, image: 'Addition-Mob-9.png' },
      { name: 'Addition-Boss-3', displayName: "THE TOTEM FURIES", maxHp: 7, image: 'Addition-Boss-3.png' }
    ]
  },
  subtraction: {
    1: [
      { name: 'Subtraction-Mob-1', displayName: "MUMMY REBIRTH", maxHp: 3, image: 'Subtraction-Mob-1.png' },
      { name: 'Subtraction-Mob-2', displayName: "ANUBIS CHOSEN", maxHp: 4, image: 'Subtraction-Mob-2.png' },
      { name: 'Subtraction-Mob-3', displayName: "TART TERRITOR", maxHp: 6, image: 'Subtraction-Mob-3.png' },
      { name: 'Subtraction-Boss-1', displayName: "THE SOARING SENTINEL", maxHp: 7, image: 'Subtraction-Boss-1.png' }
    ],
    2: [
      { name: 'Subtraction-Mob-4', displayName: "DUNE DRAINER", maxHp: 4, image: 'Subtraction-Mob-4.png' },
      { name: 'Subtraction-Mob-5', displayName: "SCARAB SENTINELS", maxHp: 5, image: 'Subtraction-Mob-5.png' },
      { name: 'Subtraction-Mob-6', displayName: "SAND SCORPIONS", maxHp: 6, image: 'Subtraction-Mob-6.png' },
      { name: 'Subtraction-Boss-2', displayName: "THE PYRAMID SPHINX", maxHp: 7, image: 'Subtraction-Boss-2.png' }
    ],
    3: [
      { name: 'Subtraction-Mob-7', displayName: "TOMB STALKER", maxHp: 2, image: 'Subtraction-Mob-7.png' },
      { name: 'Subtraction-Mob-8', displayName: "ANCIENT WARDEN", maxHp: 5, image: 'Subtraction-Mob-8.png' },
      { name: 'Subtraction-Mob-9', displayName: "SAND JINN", maxHp: 6, image: 'Subtraction-Mob-9.png' },
      { name: 'Subtraction-Boss-3', displayName: "THE ANCIENT RULER", maxHp: 7, image: 'Subtraction-Boss-3.png' }
    ]
  },
  counting: {
    1: [
      { name: 'Counting-Mob-1', displayName: "COLORFUL BIRD", maxHp: 3, image: 'Counting-Mob-1.png' },
      { name: 'Counting-Mob-2', displayName: "AURORA TREE", maxHp: 5, image: 'Counting-Mob-2.png' },
      { name: 'Counting-Mob-3', displayName: "PRISMATIC FROG", maxHp: 5, image: 'Counting-Mob-3.png' },
      { name: 'Counting-Boss-1', displayName: "THE JUMP JESTER", maxHp: 7, image: 'Counting-Boss-1.png' }
    ],
    2: [
      { name: 'Counting-Mob-4', displayName: "COLORFALL UNICORN", maxHp: 4, image: 'Counting-Mob-4.png' },
      { name: 'Counting-Mob-5', displayName: "SPECTRAL LILY", maxHp: 5, image: 'Counting-Mob-5.png' },
      { name: 'Counting-Mob-6', displayName: "CHROMA FLORA", maxHp: 6, image: 'Counting-Mob-6.png' },
      { name: 'Counting-Boss-2', displayName: "THE RAINBOW WISHER", maxHp: 7, image: 'Counting-Boss-2.png' }
    ],
    3: [
      { name: 'Counting-Mob-7', displayName: "SPECTRAL FINNED", maxHp: 4, image: 'Counting-Mob-7.png' },
      { name: 'Counting-Mob-8', displayName: "SPECTRAL PIXIE", maxHp: 3, image: 'Counting-Mob-8.png' },
      { name: 'Counting-Mob-9', displayName: "COLORSPROUT", maxHp: 5, image: 'Counting-Mob-9.png' },
      { name: 'Counting-Boss-3', displayName: "THE PRISMATIC HEXER", maxHp: 7, image: 'Counting-Boss-3.png' }
    ]
  },
  comparison: {
    1: [
      { name: 'Comparison-Mob-1', displayName: "CAVERN GREMLINS", maxHp: 2, image: 'Comparison-Mob-1.png' },
      { name: 'Comparison-Mob-2', displayName: "IRONCLAD ANTS", maxHp: 4, image: 'Comparison-Mob-2.png' },
      { name: 'Comparison-Mob-3', displayName: "TREEHOPPERS", maxHp: 6, image: 'Comparison-Mob-3.png' },
      { name: 'Comparison-Boss-1', displayName: "THE CAVERN FLYERS", maxHp: 7, image: 'Comparison-Boss-1.png' }
    ],
    2: [
      { name: 'Comparison-Mob-4', displayName: "TWISTED BRANCHES", maxHp: 2, image: 'Comparison-Mob-4.png' },
      { name: 'Comparison-Mob-5', displayName: "FLUTTERBLOODS", maxHp: 4, image: 'Comparison-Mob-5.png' },
      { name: 'Comparison-Mob-6', displayName: "STARDUST OWLS", maxHp: 3, image: 'Comparison-Mob-6.png' },
      { name: 'Comparison-Boss-2', displayName: "THE SKYCLAW HAWKS", maxHp: 7, image: 'Comparison-Boss-2.png' }
    ],
    3: [
      { name: 'Comparison-Mob-7', displayName: "EQUALIZER", maxHp: 2, image: 'Comparison-Mob-7.png' },
      { name: 'Comparison-Mob-8', displayName: "MISTY WOOLS", maxHp: 4, image: 'Comparison-Mob-8.png' },
      { name: 'Comparison-Mob-9', displayName: "FLITFURY GNATS", maxHp: 5, image: 'Comparison-Mob-9.png' },
      { name: 'Comparison-Boss-3', displayName: "THE VOLCA GOLEM", maxHp: 7, image: 'Comparison-Boss-3.png' }
    ]
  },
  numerals: {
    1: [
      { name: 'Numerals-Mob-1', displayName: "CRYPT DEFENDERS", maxHp: 3, image: 'Numerals-Mob-1.png' },
      { name: 'Numerals-Mob-2', displayName: "WRAITHBONE", maxHp: 4, image: 'Numerals-Mob-2.png' },
      { name: 'Numerals-Mob-3', displayName: "BOWMASTER CENTAUR", maxHp: 5, image: 'Numerals-Mob-3.png' },
      { name: 'Numerals-Boss-1', displayName: "THE SWORDHALL KNIGHT", maxHp: 7, image: 'Numerals-Boss-1.png' }
    ],
    2: [
      { name: 'Numerals-Mob-4', displayName: "IRONHORN WARRIOR", maxHp: 2, image: 'Numerals-Mob-4.png' },
      { name: 'Numerals-Mob-5', displayName: "SIREN'S MARKSMAN", maxHp: 4, image: 'Numerals-Mob-5.png' },
      { name: 'Numerals-Mob-6', displayName: "WINGED EQUUS", maxHp: 5, image: 'Numerals-Mob-6.png' },
      { name: 'Numerals-Boss-2', displayName: "THE CHIMERA KING", maxHp: 7, image: 'Numerals-Boss-2.png' }
    ],
    3: [
      { name: 'Numerals-Mob-7', displayName: "FERAL TIGER", maxHp: 3, image: 'Numerals-Mob-7.png' },
      { name: 'Numerals-Mob-8', displayName: "FLAMEWING EAGLE", maxHp: 5, image: 'Numerals-Mob-8.png' },
      { name: 'Numerals-Mob-9', displayName: "STONEFIST GOLEM", maxHp: 6, image: 'Numerals-Mob-9.png' },
      { name: 'Numerals-Boss-3', displayName: "THE THREEFURY KNIGHT", maxHp: 7, image: 'Numerals-Boss-3.png' }
    ]
  },
  placevalue: {
    1: [
      { name: 'PlaceValue-Mob-1', displayName: "CROP CRUSHER", maxHp: 3, image: 'Placevalue-Mob-1.png' },
      { name: 'PlaceValue-Mob-2', displayName: "BARNHOG BEAST", maxHp: 5, image: 'Placevalue-Mob-2.png' },
      { name: 'PlaceValue-Mob-3', displayName: "SHEEP TRIO", maxHp: 5, image: 'Placevalue-Mob-3.png' },
      { name: 'PlaceValue-Boss-1', displayName: "THE CORNFIELD SENTINEL", maxHp: 7, image: 'Placevalue-Boss-1.png' }
    ],
    2: [
      { name: 'PlaceValue-Mob-4', displayName: "WOLFSTORM", maxHp: 3, image: 'Placevalue-Mob-4.png' },
      { name: 'PlaceValue-Mob-5', displayName: "INFERNO HORSE", maxHp: 4, image: 'Placevalue-Mob-5.png' },
      { name: 'PlaceValue-Mob-6', displayName: "RAGING TUSK", maxHp: 5, image: 'Placevalue-Mob-6.png' },
      { name: 'PlaceValue-Boss-2', displayName: "THE WINDMILL HAVEN", maxHp: 7, image: 'Placevalue-Boss-2.png' }
    ],
    3: [
      { name: 'PlaceValue-Mob-7', displayName: "MUDHAVEN BEAST", maxHp: 4, image: 'Placevalue-Mob-7.png' },
      { name: 'PlaceValue-Mob-8', displayName: "FALLOW SENTRY", maxHp: 6, image: 'Placevalue-Mob-8.png' },
      { name: 'PlaceValue-Mob-9', displayName: "HARVEST SCARECROW", maxHp: 5, image: 'Placevalue-Mob-9.png' },
      { name: 'PlaceValue-Boss-3', displayName: "THE CINDERSCORCH", maxHp: 7, image: 'Placevalue-Boss-3.png' }
    ]
  }
};

const rewardMap = {
  multiplication: {
    1: "reward-multiplication-badge",
    2: "reward-multiplication-title",
    3: "reward-multiplication-border"
  },
  addition: {
    1: "reward-addition-badge",
    2: "reward-addition-title",
    3: "reward-addition-border"
  },
  subtraction: {
    1: "reward-subtraction-badge",
    2: "reward-subtraction-title",
    3: "reward-subtraction-border"
  },
  division: {
    1: "reward-division-badge",
    2: "reward-division-title",
    3: "reward-division-border"
  },
  counting: {
    1: "reward-counting-badge",
    2: "reward-counting-title",
    3: "reward-counting-border"
  },
  comparison: {
    1: "reward-comparison-badge",
    2: "reward-comparison-title",
    3: "reward-comparison-border"
  },
  numerals: {
    1: "reward-numerals-badge",
    2: "reward-numerals-title",
    3: "reward-numerals-border"
  },
  placevalue: {
    1: "reward-placevalue-badge",
    2: "reward-placevalue-title",
    3: "reward-placevalue-border"
  }
};

const rewardData = {
  multiplication: {
    badge: "/static/images/gameimg/rewardimg/badge/badge-1.png",
    title: "/static/images/gameimg/rewardimg/title/title-1.png",
    border: "/static/images/gameimg/rewardimg/border/border-1.png"
  },
  addition: {
    badge: "/static/images/gameimg/rewardimg/badge/badge-2.png",
    title: "/static/images/gameimg/rewardimg/title/title-2.png",
    border: "/static/images/gameimg/rewardimg/border/border-2.png"
  },
  subtraction: {
    badge: "/static/images/gameimg/rewardimg/badge/badge-3.png",
    title: "/static/images/gameimg/rewardimg/title/title-3.png",
    border: "/static/images/gameimg/rewardimg/border/border-3.png"
  },
  division: {
    badge: "/static/images/gameimg/rewardimg/badge/badge-4.png",
    title: "/static/images/gameimg/rewardimg/title/title-4.png",
    border: "/static/images/gameimg/rewardimg/border/border-4.png"
  },
  counting: {
    badge: "/static/images/gameimg/rewardimg/badge/badge-5.png",
    title: "/static/images/gameimg/rewardimg/title/title-5.png",
    border: "/static/images/gameimg/rewardimg/border/border-5.png"
  },
  comparison: {
    badge: "/static/images/gameimg/rewardimg/badge/badge-6.png",
    title: "/static/images/gameimg/rewardimg/title/title-6.png",
    border: "/static/images/gameimg/rewardimg/border/border-6.png"
  },
  numerals: {
    badge: "/static/images/gameimg/rewardimg/badge/badge-7.png",
    title: "/static/images/gameimg/rewardimg/title/title-7.png",
    border: "/static/images/gameimg/rewardimg/border/border-7.png"
  },
  placevalue: {
    badge: "/static/images/gameimg/rewardimg/badge/badge-8.png",
    title: "/static/images/gameimg/rewardimg/title/title-8.png",
    border: "/static/images/gameimg/rewardimg/border/border-8.png"
  }
};

// Define skins
const skins = [
  {
    id: 'default-skin', 
    name: 'Default Skin',
    src: '/static/images/anim/sprite/defaultidle.png',
    attackSrc: '/static/images/anim/sprite/defaultattack.png',
    fireballSrc: '/static/images/anim/sprite/default.png',

  },
  {
    id: 'r1',
    name: 'Multiplication Skin',
    src: '/static/images/anim/sprite/idle01.png',
    attackSrc: '/static/images/anim/sprite/attack01.png',
    fireballSrc: '/static/images/anim/sprite/multiplication.png',
  },
  {
    id: 'r2',
    name: 'Addition Skin',
    src: '/static/images/anim/sprite/idle02.png',
    attackSrc: '/static/images/anim/sprite/attack02.png',
    fireballSrc: '/static/images/anim/sprite/addition.png',
  },
  {
    id: 'r3',
    name: 'Subtraction Skin',
    src: '/static/images/anim/sprite/idle03.png',
    attackSrc: '/static/images/anim/sprite/attack03.png',
    fireballSrc: '/static/images/anim/sprite/subtraction.png',
  },
  {
    id: 'r4',
    name: 'Division Skin',
    src: '/static/images/anim/sprite/idle04.png',
    attackSrc: '/static/images/anim/sprite/attack04.png',
    fireballSrc: '/static/images/anim/sprite/division.png',
  },
  {
    id: 'r5',
    name: 'Counting Skin',
    src: '/static/images/anim/sprite/idle05.png',
    attackSrc: '/static/images/anim/sprite/attack05.png',
    fireballSrc: '/static/images/anim/sprite/counting.png',
  },
  {
    id: 'r6',
    name: 'Comparison Skin',
    src: '/static/images/anim/sprite/idle06.png',
    attackSrc: '/static/images/anim/sprite/attack06.png',
    fireballSrc: '/static/images/anim/sprite/comparison.png',
  },
  {
    id: 'r7',
    name: 'Numerals Skin',
    src: '/static/images/anim/sprite/idle07.png',
    attackSrc: '/static/images/anim/sprite/attack07.png',
    fireballSrc: '/static/images/anim/sprite/numerals.png',
  },
  {
    id: 'r8',
    name: 'Place Value Skin',
    src: '/static/images/anim/sprite/idle08.png',
    attackSrc: '/static/images/anim/sprite/attack08.png',
    fireballSrc: '/static/images/anim/sprite/placevalue.png',
  },
];






// Global state for current stage
let currentMonsterIndex = 0;
let monstersInStage     = [];

// Determine the folder based on selected map
const folder = selectedMap.charAt(0).toUpperCase() + selectedMap.slice(1);

function initMapAndStage() {
  // 1) Set the background image based on selected map
  const bgEl = document.getElementById('game-bg');
  const bgFile = mapBackgrounds[selectedMap];
  if (bgFile) {
    bgEl.style.backgroundImage = `url('/static/images/gameimg/gamebg/${bgFile}')`;
  } else {
    console.error(`Background image not found for map: ${selectedMap}`);
  }

  // 2) Set the platform image based on selected map
  const platformImage = mapPlatforms[selectedMap];
  const platformImgEl = document.getElementById('platform-image');
  if (platformImage && platformImgEl) {
    platformImgEl.src = `/static/images/gameimg/Platforms/${platformImage}?t=${Date.now()}`;
    
    // Dynamically assign a platform class based on the selected map
    const platformClass = `platform-${selectedMap.toLowerCase()}`;
    platformImgEl.className = platformClass;  // Adding class to platform

  } else {
    console.error(`Platform image not found for map: ${selectedMap}`);
  }

  // 3) Load the list of monsters for this map and stage
  monstersInStage = (mapStages[selectedMap] || {})[selectedStage] || [];

  // 4) If no monsters are found → game over
  if (!monstersInStage.length) {
    return showGameOverScreen();
  }

  // 5) Spawn the first monster in the list
  spawnMonster(0);

  // Log initialization
  // console.log('Map and stage initialized for map:', selectedMap, 'stage:', selectedStage);
}




function playBossSFX() {
  const audio = new Audio('/static/sfx/bossbattle.mp3'); // Replace path if needed
  audio.volume = 0.8;
  audio.play();
}
function playFinalBossSFX() {
  const audio = new Audio('/static/sfx/finalboss.mp3'); // change path as needed
  audio.volume = 0.9;
  audio.play();
}


async function spawnMonster(idx, shouldFetchQuestion = false) {
  const m = monstersInStage[idx];
  if (!m) return showVictoryScreen();

  // Ensure folder is lowercase to match Linux file system
  const safeFolder = folder.toLowerCase();
  // console.log(safeFolder); 

  // ✅ Check if this is the last monster (boss)
  const isFinalBoss = selectedStage === 3 && idx === monstersInStage.length - 1;
  if (isFinalBoss) {
    console.log("🎯 Final Boss has spawned!");
    playFinalBossSFX();
  } else if (idx === monstersInStage.length - 1) {
    console.log("🔥 Boss monster has spawned!");
    playBossSFX();
  }
  
  currentMonsterHealth = m.maxHp;
  maxMonsterHealth = m.maxHp;

  const monsterImg = document.getElementById('monster-sprite');
  const monsterNameEl = document.querySelector('.monster-name');
  if (!monsterImg) {
    console.error('#monster-sprite missing');
    return;
  }

  const monsterSrc = `/static/images/gameimg/mnstr/${safeFolder}/${m.image}?t=${Date.now()}`;
  // console.log("Monster image source:", monsterSrc);

  monsterImg.src = monsterSrc;
  monsterImg.className = 'monster';
  const specific = `monster-${m.name.toLowerCase().replace(/\s+/g, '-')}`;
  monsterImg.classList.add(specific);

  monsterImg.style.height = m.height || 'auto';
  monsterImg.style.bottom = m.bottom || '0';
  monsterImg.style.left = m.left || '0';

  if (monsterNameEl) {
    monsterNameEl.textContent = m.displayName || m.name.replace(/-/g, ' ');
  }

  // console.log('Current difficulty before question fetch:', currentDifficulty);

  if (!isMonsterSpawnAnimationInProgress) {
    isMonsterSpawnAnimationInProgress = true;

    monsterImg.classList.remove('monster-spawn');
    void monsterImg.offsetWidth; // Force reflow
    monsterImg.classList.add('monster-spawn');

    monsterImg.addEventListener('animationend', async function clearSpawn() {
      monsterImg.classList.remove('monster-spawn');
      isMonsterSpawnAnimationInProgress = false;
      monsterImg.removeEventListener('animationend', clearSpawn);

      updateHealthBars();

      const qText = document.getElementById('question-text');
      qText.classList.remove('fade-in');
      qText.classList.add('fade-out');

      setTimeout(async () => {
        if (shouldFetchQuestion) {
          await fetchNewQuestion();
        }

        qText.classList.remove('fade-out');
        qText.classList.add('fade-in');
      }, 500);
    });
  } else {
    console.log("Spawn in progress, skipping spawn for now.");
  }
}
















function triggerMonsterDeathAnimation() {
  const monsterImg = document.getElementById('monster-sprite');
  if (!monsterImg) return;

  // Play death sound effect

  // Start death animation
  monsterImg.classList.add('monster-death');
  
  // Set death animation flag
  isMonsterDeathAnimationInProgress = true;

  // Reset after death animation
  monsterImg.addEventListener('animationend', function clearDeath() {
    monsterImg.classList.remove('monster-death');
    isMonsterDeathAnimationInProgress = false; // End death animation
    monsterImg.removeEventListener('animationend', clearDeath);

    // Proceed to next monster after death animation
    nextMonster();
  });
}



// Go to next monster
function nextMonster() {
  currentMonsterIndex++;
  if (currentMonsterIndex >= monstersInStage.length) {
    return showVictoryScreen();
  }
  spawnMonster(currentMonsterIndex);
}


function startMonsterDeathAnimation() {
  isMonsterDeathAnimationInProgress = true;

  // Your death animation code here
  
  // Once death animation is finished, reset the flag
  setTimeout(() => {
    isMonsterDeathAnimationInProgress = false;
  }, deathAnimationDuration); // Use the actual duration of the death animation
}
function startMonsterSpawnAnimation() {
  isMonsterSpawnAnimationInProgress = true;

  // Your spawn animation code here
  
  // Once spawn animation is finished, reset the flag
  setTimeout(() => {
    isMonsterSpawnAnimationInProgress = false;
  }, spawnAnimationDuration); // Use the actual duration of the spawn animation
}


// ======= HEALTH BAR LOGIC =======
    function getHpImagePath(currentHp, maxHp, isPlayer = true) {
      const hpRatio = currentHp / maxHp;
      const scaledHp = Math.round(hpRatio * maxHp);
      const clampedHp = Math.max(0, Math.min(scaledHp, maxHp));
      const prefix = isPlayer ? 'player-hp-' : 'monster-hp-';
    
      // Get the base URL from the hidden div
      const baseUrl = document.getElementById("hp-bar-path").dataset.baseUrl;
      return `${baseUrl}${prefix}${clampedHp}.png`;
    }
    

  const maxPlayerHealth    = 5;
  let   currentPlayerHealth = maxPlayerHealth;
  const playerHealthBar    = document.getElementById('player-health');

  let   maxMonsterHealth   = 3;  // ← let so we can reassign per monster
  let   currentMonsterHealth = maxMonsterHealth;
  const monsterHealthBar   = document.getElementById('monster-health');

  function renderHpBar(bar, curr, max, isPlayer = true) {
    bar.innerHTML = '';
    const img = document.createElement('img');
    img.src       = getHpImagePath(curr, max, isPlayer);
    img.alt       = 'HP Bar';
    img.className = 'hp-bar-image';
    bar.appendChild(img);
  }
  function updateHealthBars() {
    renderHpBar(playerHealthBar, currentPlayerHealth, maxPlayerHealth, true);
    renderHpBar(monsterHealthBar, currentMonsterHealth, maxMonsterHealth, false);
  }
  updateHealthBars();


  // ======= PLAYER HEALTH =======
  function playerHeal(amount) {
    currentPlayerHealth = Math.min(currentPlayerHealth + amount, maxPlayerHealth);
    updateHealthBars();
  }
  function playerTakeDamage() {
    const monsterContainer = document.querySelector('.monster');
    const player = document.querySelector('.player');
  
    // ❄️ No damage if monster is frozen
    if (monsterContainer.classList.contains('frozen')) {
      console.log('❄️ Monster is frozen — no damage or animation.');
      return;
    }
  
    // 🔥 Apply damage animation to the player
    player.classList.add('player-damaged', 'shake');
    setTimeout(() => {
      player.classList.remove('player-damaged', 'shake');
    }, 600);
  
    // ❤️ Deduct HP
    if (currentPlayerHealth > 0) {
      currentPlayerHealth--;
      updateHealthBars();
      // console.log('💔 Player HP →', currentPlayerHealth);
    }
  
    // Play player damage sound
    playSound('/static/sfx/playerdamaged.mp3', 0);  // Sound for player taking damage
  
    checkGameOver();
  }
  
  
  

  function monsterTakeDamage() {
    const monsterImg = document.getElementById('monster-sprite');
    if (currentMonsterHealth > 0) {
      currentMonsterHealth--;
      updateHealthBars();
  
      if (currentMonsterHealth <= 0) {
        // Cancel freeze effect if active
        if (freezePotionUsed) {
          freezePotionUsed = false;
          freezeTurns = 1;
          removeFreezeEffect();
          freezeTurnsDisplay.style.display = 'none';
        }
  
        if (!monsterImg) return;
  
        // 🔊 Play death SFX before animation starts
        playSound('/static/sfx/deathanim.mp3', 0); // make sure the path is correct
  
        // 1) Trigger death animation
        monsterImg.classList.add('monster-death');
        // console.log("Death animation added");
  
        // 2) Wait for animation to complete
        monsterImg.addEventListener('animationend', function onDeath() {
          // console.log("Death animation ended");
          monsterImg.removeEventListener('animationend', onDeath);
  
          // 3) Keep the monster there for 2s, but fade it out smoothly
          setTimeout(() => {
  
            // Add fade out effect
            monsterImg.style.transition = 'opacity 0.5s ease';
            monsterImg.style.opacity = '0';
  
            // After fade completes (0.5s), spawn the next monster
            setTimeout(() => {
              monsterImg.classList.remove('monster-death');
              monsterImg.style.opacity = '';
              monsterImg.style.transition = '';
              monsterImg.style.transform = '';
  
              nextMonster();
            }, 500); // Wait for fade-out to finish
          }, 100); // Short wait before fade
        });
      }
    }
    checkGameOver();
  }
  


// ======= GAME OVER =======
function checkGameOver() {
  if (currentPlayerHealth <= 0) {
    setTimeout(() => {
      showGameOverScreen(); // This will show your custom Game Over screen
    }, 1000); // Delay to allow any final animation to finish
  }
}



















// Function to fetch new question based on current map and difficulty


// Initial load to fetch first question after progress load















  function displayFeedback(msg) {
    const fb = document.getElementById('feedback');
    fb.innerText = msg;
    fb.style.display = 'block';
    setTimeout(() => fb.style.display = 'none', 2000);
  }


  // ======= INPUT PAD =======
  function addToInput(v) {
    document.getElementById('number-input').value += v;
  }
  function backspace() {
    const f = document.getElementById('number-input');
    f.value = f.value.slice(0, -1);
  }














function showVictoryScreen() {
  const gameContainer = document.querySelector('.ground');
  if (!gameContainer) {
      console.error("Game container not found!");
      return;
  }

  const victoryScreen = document.getElementById('victory-screen');
  const victoryBox = victoryScreen.querySelector('.victory-box');
  const continueBtn = document.getElementById('continue-btn');
  const retryBtn = document.getElementById('retry-btn');
  const homeBtn = document.getElementById('home-btn');

  console.log("Victory screen elements initialized.");

  const urlParams = new URLSearchParams(window.location.search);
  const selectedMap = urlParams.get('map') || 'multiplication';
  const selectedStage = parseInt(urlParams.get('stage')) || 1;

  // Button actions with click sound
  continueBtn.onclick = () => {
      console.log("Continue button clicked.");
      window.playSound('/static/sfx/click.mp3', 0.5);
      document.getElementById('bg-music')?.pause();
      playExitAnimationAndNavigate(`/stages?map=${selectedMap}&stage=${selectedStage}`);
  };

  retryBtn.onclick = () => {
      window.playSound('/static/sfx/click.mp3', 0.5);
      document.getElementById('bg-music')?.pause();
      playExitAnimationAndNavigate('reload');
  };

  homeBtn.onclick = () => {
      window.playSound('/static/sfx/click.mp3', 0.5);
      document.getElementById('bg-music')?.pause();
      playExitAnimationAndNavigate('/roadmap');
  };

  // Remove all monsters and pause the game
  document.querySelectorAll('.monster, .monster-spawn, .monster-death').forEach(el => el.remove());
  gameContainer.classList.add('paused');

  // Show the victory screen and play the victory sound
  victoryScreen.style.visibility = 'visible';
  victoryScreen.classList.add('visible');
  document.getElementById('bg-music')?.pause();
  window.playSound('/static/sfx/victory.mp3', 0.7);
  victoryBox.classList.add('box-animation');

  console.log("Victory screen displayed.");

  // Fetch reward for the selected stage
  fetch(`/get_stage_reward?map=${selectedMap}&stage=${selectedStage}`)
      .then(res => res.json())
      .then(data => {
          console.log("Reward data fetched:", data);
          if (data.error) return;

          const { badge, title, border } = data;
          const rewardCategories = rewardMap[selectedMap];
          if (!rewardCategories) return;

          const badgeElement = document.getElementById(rewardCategories[1]);
          const titleElement = document.getElementById(rewardCategories[2]);
          const borderElement = document.getElementById(rewardCategories[3]);

          // Hide reward elements initially
          [badgeElement, titleElement, borderElement].forEach(el => el?.classList.add('hidden'));
          document.getElementById('reward-claimed-text')?.remove();

          // Check if the reward has already been claimed
          fetch('/check_reward_claimed', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  map: selectedMap,
                  stage: selectedStage
              })
          })
          .then(res => res.json())
          .then(data => {
              console.log("Reward claim status:", data);
              const rewardStatusText = document.createElement('div');
              rewardStatusText.id = "reward-claimed-text";
              rewardStatusText.className = "reward-claimed-text fade-in";

              if (data.error) {
                  console.warn('Reward check failed:', data.error);
                  rewardStatusText.textContent = "⚠️ Unable to verify reward.";
                  victoryBox.appendChild(rewardStatusText);
                  return;
              }

              if (data.claimed) {
                  rewardStatusText.textContent = "🎉 Reward Claimed!";
                  victoryBox.appendChild(rewardStatusText);
              } else {
                  if (selectedStage === 1 && badgeElement) {
                      badgeElement.src = badge;
                      badgeElement.classList.remove('hidden');
                  } else if (selectedStage === 2 && titleElement) {
                      titleElement.src = title;
                      titleElement.classList.remove('hidden');
                  } else if (selectedStage === 3 && borderElement) {
                      borderElement.src = border;
                      borderElement.classList.remove('hidden');
                  }

                  fetch('/claim_reward', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          map: selectedMap,
                          stage: selectedStage
                      })
                  })
                  .then(res => res.json())
                  .then(() => {
                      console.log("Reward claimed successfully");
                  })
                  .catch(err => {
                      console.warn('Claim reward failed:', err.message);
                  });
              }
          })
          .catch(err => console.error('Error checking reward:', err));
      })
      .catch(err => console.error('Error fetching stage reward:', err));

  // === PROGRESS UPDATE ===
  if (selectedMap && selectedStage) {
      const starsEarned = 1;
      updateStageProgress(selectedMap, selectedStage, starsEarned);
      updateRoadmapStars(`${selectedMap}-${selectedStage}`);
  }
}



  
  function incrementStageProgress(stageKey) {
        //================CONNECTION > DATABASE==========================//
  
    if (stageData.stars < 3) {
        stageData.stars++;
    }
  
    if (stageData.stars === 3) {
        stageData.completed = true;
    }
      //================CONNECTION > DATABASE==========================//
    setStars(`.${stageKey}-stars`, stageKey);
  }
  


  


// STARS UPDATE SA ROADMAP  //

function updateStageProgress(selectedMap, selectedStage, starsEarned = 1) {
  const stageKey = `${selectedMap}-${selectedStage}`;

  // =============== CONNECTION > DATABASE =============== //
  console.log(`Saving progress for ${stageKey} with ${starsEarned} stars`);

  fetch('/save_progress', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      map: selectedMap,
      stage: selectedStage,
      stars: starsEarned,
      completed: true // Add "completed" flag if necessary
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      // After saving, update the stars in the roadmap
      fetch(`/get_stage_progress?map=${selectedMap}`)
        .then(response => response.json())
        .then(stageProgress => {
          // console.log("Fetched Stage Progress:", stageProgress); // Log the fetched data
          updateRoadmapStars(selectedMap, stageProgress);
        })
        .catch(error => {
        });
    } else {
    }
  })
}



function updateRoadmapStars(selectedMap) {
  // No need to define stageProgress here since it's globally available
  if (!window.stageProgress) {
    return; // No data available, exit function
  }

  for (let stage = 1; stage <= 3; stage++) {
    const stageKey = `${selectedMap}-${stage}`;
    const stageData = window.stageProgress[stageKey];

    if (!stageData) {
      continue;  // Skip this stage if no data exists
    }


    const roadmapItem = document.querySelector(`.stage-item[data-stage-key="${stageKey}"]`);
    if (!roadmapItem) {
      continue;
    }

    const starWrapper = roadmapItem.querySelector('.star-wrapper');
    const starImgs = starWrapper.querySelectorAll('.progress-star');

    starImgs.forEach((img, index) => {
      if (index < stageData.stars) {
        img.src = window.STAR_IMAGES.filled;  // Fill star
      } else {
        img.src = window.STAR_IMAGES.empty;  // Empty star
      }
    });
  }
}









function calculateStars() {
  if (currentPlayerHealth === 0) {
    return 0;  // Game over, no stars awarded
  } else {
    return 1;  // Always 1 star when the stage is completed
  }
}










// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //

function playExitAnimationAndNavigate(targetUrl) {
  // Pause bg music
  document.getElementById('bg-music')?.pause();

  // Create loading overlay
  const loadingOverlay = document.createElement('div');
  loadingOverlay.style.position = 'fixed';
  loadingOverlay.style.top = '0';
  loadingOverlay.style.left = '0';
  loadingOverlay.style.width = '100vw';
  loadingOverlay.style.height = '100vh';
  loadingOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
  loadingOverlay.style.backdropFilter = 'blur(10px)';
  loadingOverlay.style.webkitBackdropFilter = 'blur(10px)';
  loadingOverlay.style.display = 'flex';
  loadingOverlay.style.justifyContent = 'center';
  loadingOverlay.style.alignItems = 'center';
  loadingOverlay.style.zIndex = '9999';

  const topHalf = document.createElement('img');
  topHalf.src = '/static/images/anim/loading/up.png';
  topHalf.style.position = 'absolute';
  topHalf.style.top = '0';
  topHalf.style.left = '0';
  topHalf.style.width = '100vw';
  topHalf.style.height = '50%';
  topHalf.style.objectFit = 'fill';
  topHalf.style.transition = 'transform 2s ease';
  topHalf.style.willChange = 'transform';

  const bottomHalf = document.createElement('img');
  bottomHalf.src = '/static/images/anim/loading/down.png';
  bottomHalf.style.position = 'absolute';
  bottomHalf.style.bottom = '0';
  bottomHalf.style.left = '0';
  bottomHalf.style.width = '100vw';
  bottomHalf.style.height = '50%';
  bottomHalf.style.objectFit = 'fill';
  bottomHalf.style.transition = 'transform 2s ease';
  bottomHalf.style.willChange = 'transform';

  loadingOverlay.appendChild(topHalf);
  loadingOverlay.appendChild(bottomHalf);
  document.body.appendChild(loadingOverlay);

  // Play loading SFX
  window.playSound('/static/sfx/loading.mp3', 0);

  // Force reflow
  void topHalf.offsetHeight;

  // Animate sliding
  setTimeout(() => {
    topHalf.style.transform = 'translateY(-100%)';
    bottomHalf.style.transform = 'translateY(100%)';
  }, 0);

  // Navigate after animation
  setTimeout(() => {
    if (targetUrl === 'reload') {
      window.location.reload();
    } else {
      window.location.href = targetUrl;
    }
  }, 2300);
}


// Show the game over screen
function showGameOverScreen() {
  const gameContainer = document.querySelector('.ground');
  if (!gameContainer) {
    console.error('Game container not found!');
    return;
  }

  const gameoverScreen = document.getElementById('gameover-screen');
  const gameoverBox = gameoverScreen.querySelector('.gameover-box');
  const gameoverButtons = document.querySelector('.gameover-buttons');
  const retryBtn = gameoverButtons.querySelector('#go-retry-btn');
  const homeBtn = gameoverButtons.querySelector('#go-home-btn');

  // Remove monsters
  document.querySelectorAll('.monster, .monster-spawn, .monster-death').forEach(el => el.remove());

  // Pause game
  gameContainer.classList.add('paused');

  // Show game over screen
  gameoverScreen.style.visibility = 'visible';
  gameoverScreen.classList.add('visible');
  document.getElementById('bg-music')?.pause();
  playSound('/static/sfx/gameover.mp3', 0);  // Adjust the sound speed and file path
  gameoverBox.classList.add('box-animation');

  // Button events
  retryBtn.onclick = () => {
    document.getElementById('bg-music')?.pause();
    playExitAnimationAndNavigate('reload');
  };

  const routePaths = document.getElementById("route-paths").dataset;

  homeBtn.onclick = () => {
    document.getElementById('bg-music')?.pause();
    playExitAnimationAndNavigate(routePaths.dashboard);
  };
}




// Function for monster's attack animation
function monsterAttack() {
  const monster = document.querySelector('.monster');
  const player = document.querySelector('.player');

  // Play monster attack sound when the monster attacks
  playSound('/static/sfx/monsterattack.mp3', 500);  // Adjust the sound speed and file path

  // Add the attack animation class to the monster
  monster.classList.add("monster-attack");

  // After the attack animation ends, apply the damage
  setTimeout(() => {
    monster.classList.remove("monster-attack");

    // ✅ Apply damage and animation in one function
    setTimeout(() => {
      playerTakeDamage();
    }, 0);
  }, 800);

  checkGameOver();
}


// ========== UPDATE POTION UI ==========
function updatePotionUI() {
  const freezePotion = document.querySelector('.freeze-potion');
  const freezeQuantity = document.getElementById('freeze-quantity');
  freezeQuantity.innerText = freezePotions;
  if (freezePotions <= 0) freezePotion.classList.add('potion-depleted');
  else freezePotion.classList.remove('potion-depleted');

  const healthPotion = document.querySelector('.health-potion');
  const healthQuantity = document.getElementById('health-quantity');
  healthQuantity.innerText = healthPotions;
  if (healthPotions <= 0) healthPotion.classList.add('potion-depleted');
  else healthPotion.classList.remove('potion-depleted');

  const thunderPotion = document.querySelector('.thunder-potion');
  const thunderQuantity = document.getElementById('thunder-quantity');
  thunderQuantity.innerText = thunderPotions;
  if (thunderPotions <= 0) thunderPotion.classList.add('potion-depleted');
  else thunderPotion.classList.remove('potion-depleted');
}





function fireballAttack() {
  if (sessionStorage.getItem('fireballTriggered')) return;

  const groundContainer = document.querySelector(".ground");
  const player = document.querySelector(".player");
  const monster = document.querySelector(".monster");

  // Add charging animation to player at start
  player.classList.add("charging");

  // Play fireball charging sound
  playSound('/static/sfx/attack.mp3', 100); // Flask static URL for fireball sound

  // Fetch equipped skin from backend
  fetch('/get_user_skins')
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        console.error("Error fetching equipped skin:", data.error);
        // Remove charging if error fetching skin
        player.classList.remove("charging");
        return;
      }

      // Get equipped skin or fallback
      const equippedSkinId = data.equipped_skin || 'default-skin';
      const skin = skins.find(s => s.id === equippedSkinId) || skins[0];
      const selectedAttack = skin.fireballSrc;

      // Create fireball element with correct skin fireball image
      const fireball = document.createElement("img");
      fireball.src = selectedAttack;
      fireball.classList.add("fireball");

      // Position fireball at player start point
      fireball.style.left = `${player.offsetLeft + player.offsetWidth}px`;
      fireball.style.bottom = "120px";

      // Append fireball after short delay for charging effect
      setTimeout(() => {
        // Change player image to attack pose
        player.src = skin.attackSrc;
        player.style.height = "35vh";
        player.style.width = "auto";

        // Add fireball to the ground container (appear and move)
        groundContainer.appendChild(fireball);
        sessionStorage.setItem('fireballTriggered', true);

        // Play fireball hit sound after slight delay
        playSound('/static/sfx/damaged.mp3', 500);

        // Monster visual damage animation sequence
        setTimeout(() => {
          monster.classList.add("damaged");
          setTimeout(() => {
            monster.classList.remove("damaged");
          }, 600);
        }, 770);

        // Shake effect after damage
        setTimeout(() => {
          monster.classList.add("shake");
          setTimeout(() => {
            monster.classList.remove("shake");
          }, 600);
        }, 1100);

        // Apply damage and check if monster dies
        setTimeout(() => {
          const damage = 1;
          currentMonsterHealth -= damage;
          updateHealthBars();

          if (currentMonsterHealth <= 0) {
            isMonsterDeathAnimationInProgress = true;
            monster.classList.add("monster-death");
            playSound('/static/sfx/deathanim.mp3', 0);

            // Wait for death animation end
            const onDeath = () => {
              monster.removeEventListener("animationend", onDeath);
              monster.classList.remove("monster-death");
              currentMonsterIndex++;
              spawnMonster(currentMonsterIndex, true);
              isMonsterDeathAnimationInProgress = false;
            };
            monster.addEventListener("animationend", onDeath);
          }
        }, 1400);

        // Remove fireball after animation
        setTimeout(() => {
          fireball.remove();
          sessionStorage.removeItem('fireballTriggered');
        }, 1000);

        // Reset player to idle and remove charging effect
        setTimeout(() => {
          player.src = skin.src;
          player.style.height = "35vh";
          player.style.width = "auto";
          player.classList.remove("charging");

          // Handle freeze turns decrement & display update
          if (freezeTurns > 0) {
            freezeTurns--;
            if (freezeTurns === 0) {
              setTimeout(() => {
                removeFreezeEffect();
                freezeTurnsDisplay.style.display = 'none';
                console.log("⏹ Freeze effect has ended.");
              }, 100);
            }
            updateFreezeTurnsDisplay();
          }
        }, 700);

      }, 600);
    })
    .catch(error => {
      console.error("Error fetching equipped skin:", error);
      // Remove charging if error fetching skin
      player.classList.remove("charging");
    });
}






document.addEventListener("DOMContentLoaded", function () {
  const spawn = document.getElementById("player-spawn");
  const player = document.getElementById("player-idle");

  // Check if elements exist before proceeding
  if (!spawn || !player) {
    console.error("Player elements not found in the DOM");
    return;
  }

  // Fetch the equipped skin from the server (GET request to '/get_user_skins')
  fetch('/get_user_skins')
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        console.error('Error fetching user skins:', data.error);
        return;
      }

      // Get the equipped skin from the server response
      const equippedSkinId = data.equipped_skin || 'default-skin'; // Default to 'default-skin' if no equipped skin
      console.log("Equipped skin ID from server:", equippedSkinId);

      // Find the skin by its ID in the skins array or default to the first skin if none is found
      const skin = skins.find(s => s.id === equippedSkinId) || skins[0];
      console.log("Using skin:", skin);

      // Set the idle and spawn images based on the equipped skin
      player.src = skin.src;  // Set the idle image
      spawn.src = skin.src;   // Set the spawn image

      setTimeout(() => {
        // Hide the spawn image after the spawn effect duration
        spawn.classList.add("hidden");

        // Instantly show the player (idle state) without animation delay
        player.classList.remove("hidden");
      }, 1000); // Adjust this delay if needed
    })
    .catch(error => {
      console.error('Error fetching skins:', error);
    });
});




// For the monster image (if needed, based on other skins or states)
window.addEventListener("DOMContentLoaded", () => {
  const monster = document.querySelector(".monster");
  if (monster) {

  }
});







// ==================================START OF POTION SCRIPT ======================================= //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //

// Potion counts
let healthPotions = 1;
let thunderPotions = 3; // THUNDER POTION QUANTITY SET
let freezePotions = 3;

let isMonsterSpawnAnimationInProgress = false;
let isMonsterDeathAnimationInProgress = false;

// Potion usage locks
let isHealthPotionInUse = false;
let isThunderPotionInUse = false;
let isFreezePotionInUse = false;

// Freeze-related variables
let freezePotionUsed = false;
let freezeTurns = 0;
const freezeTurnsDisplay = document.getElementById('freeze-turn');
const monsterContainer = document.querySelector('.monster');
freezeTurnsDisplay.style.display = 'none';



// ========== HEALTH POTION ========== //
function useHealthPotion() {
  if (isHealthPotionInUse) return; // lock

  if (currentPlayerHealth >= maxPlayerHealth) {
    showFeedback("🧪 Full health already!");
    return;
  }

  if (healthPotions <= 0) {
    showFeedback("No Health Potions!");
    return;
  }

  isHealthPotionInUse = true;
  healthPotions--;
  updatePotionUI();

  // Play health potion sound when using the potion
  playSound('/static/sfx/heal.mp3', 0,);  // Adjust the sound file path and speed if needed

  playerHeal(3); // Heal the player
  showFeedback("🧪 Health Potion used!");

  // Add healing effect to the player image
  const playerImg = document.querySelector('.player');
  playerImg.classList.add('heal'); // Trigger the healing animation

  // Remove the heal class after the animation ends to reset the effect
  setTimeout(() => {
    playerImg.classList.remove('heal');
  }, 500); // Match the duration of your animation (2s)

  setTimeout(() => {
    isHealthPotionInUse = false; // Unlock after short delay
  }, 200);
}


function useFreezePotion() {
  // Prevent if a potion is in use, or spawn/death animation is in progress
  if (isFreezePotionInUse || isMonsterSpawnAnimationInProgress || isMonsterDeathAnimationInProgress) {
    showFeedback("❌ You can't use the Freeze Potion during monster animation!");
    return;
  }

  if (freezeTurns > 0) {
    showFeedback(`❄️ You still have ${freezeTurns} Freeze Turns left!`);
    return;
  }

  if (freezePotions <= 0) {
    showFeedback('❄️ You have no Freeze Potions left!');
    return;
  }

  isFreezePotionInUse = true;
  freezePotions--;
  freezePotionUsed = true;
  freezeTurns = 1;
  updatePotionUI();
  updateFreezeTurnsDisplay();
  freezeTurnsDisplay.style.display = 'block';

  // Play Freeze Potion sound
  playSound('/static/sfx/freeze.mp3', 100);  // Adjust the file path if needed

  // Apply the freeze effect after checking for spawn/death animations
  setTimeout(() => {
    if (!isMonsterSpawnAnimationInProgress && !isMonsterDeathAnimationInProgress) {
      applyFreezeEffect(); // Freeze the monster if no animation is in progress
    } else {
      showFeedback("❌ Can't freeze during spawn or death animation!"); // Feedback if freeze is used during animation
    }

    // Reset the Freeze Potion use state after a short delay
    setTimeout(() => {
      isFreezePotionInUse = false; // Unlock potion after short delay
    }, 400);
  }, 400);
}

function applyFreezeEffect() {
  // Freeze the monster only if it's not already frozen
  if (!monsterContainer.classList.contains('frozen')) {
    monsterContainer.classList.add('frozen');
  }
}

function removeFreezeEffect() {
  monsterContainer.classList.remove('frozen');
}

function updateFreezeTurnsDisplay() {
  freezeTurnsDisplay.innerText = `❄️ Freeze Turns Left: ${freezeTurns}`;
}



// ========== DAMAGE PLAYER (checks if frozen) ==========






// ========== THUNDER POTION ==========
const frames = document.querySelectorAll('.sprite-lightning');
let currentFrame = 0;
const monsterElement = document.querySelector('.monster');

function resetFrames() {
  frames.forEach(f => f.classList.remove('active'));
  monsterElement.classList.remove('red');
}

function changeFrame() {
  resetFrames();
  frames[currentFrame].classList.add('active');
  currentFrame++;
  if (currentFrame >= frames.length) {
    clearInterval(animationInterval);
    currentFrame = 0;
    resetFrames();
    monsterElement.classList.add('red');
    setTimeout(() => monsterElement.classList.remove('red'), 70);
  }
}

function useThunderPotion() {
  // Prevent using Thunder Potion if any animation is in progress
  if (isThunderPotionInUse || isMonsterSpawnAnimationInProgress || isMonsterDeathAnimationInProgress) {
    showFeedback("❌ Thunder Potion is on cooldown!");
    return;
  }

  if (thunderPotions <= 0) {
    const feedback = document.getElementById('feedback');
    feedback.innerText = '⚡ You have no Thunder Potions left!';
    setTimeout(() => {
      feedback.innerText = '';
    }, 2000);
    return;
  }

  if (currentMonsterHealth <= 0) {
    // console.log("❌ Monster is already defeated. Thunder Potion cannot be used.");
    return;
  }

  isThunderPotionInUse = true;
  thunderPotions--;
  updatePotionUI();

  // Play Thunder Potion sound when it's used
  playSound('/static/sfx/thunder.mp3',600); // Flask static URL for fireball hit sound

  setTimeout(() => {
    if (currentMonsterHealth > 0) {
      // Handle the Thunder Potion animation and damage
      if (animationInterval !== null) {
        clearInterval(animationInterval);
        resetFrames();
      }

      // console.log("Thunder Potion used!");

      animationInterval = setInterval(changeFrame, 80); // Faster lightning animation

      setTimeout(() => {
        const monster = document.querySelector(".monster");

        if (!monster.classList.contains('frozen')) {
          monster.classList.add("damaged");
          // Play the lightning strike damage sound when the monster is hit
          playSound('/static/sfx/damaged.mp3',0); // Flask static URL for fireball hit sound

          setTimeout(() => {
            monster.classList.remove("damaged");
            if (currentMonsterHealth > 0) {
              monsterTakeDamage();
            }
            setTimeout(() => {
              isThunderPotionInUse = false;
            }, 150);
          }, 320);
        } else {
          // console.log("❄️ Monster is frozen — no damage animation.");
          if (currentMonsterHealth > 0) {
            monsterTakeDamage();
          }
          setTimeout(() => {
            isThunderPotionInUse = false;
          }, 150);
        }
      }, 520);
    } else {
      // console.log("❌ Monster is already defeated. Thunder Potion cannot be used.");
      setTimeout(() => {
        isThunderPotionInUse = false;
      }, 150);
    }
  }, 600);
}
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ===================================END OF POTION SCRIPT ======================================== //


// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //
// ================================================================================================ //

// ===== SETTINGS MENU HANDLING =====

function openSettings() {
  playButtonClickSound();
  document.getElementById("settingsMenu").classList.remove("hidden");
  document.getElementById("gameMenu").classList.add("hidden");
}

function closeSettings() {
  playButtonClickSound();
  document.getElementById("settingsMenu").classList.add("hidden");
  document.getElementById("gameMenu").classList.remove("hidden");
}

// ===== VOLUME CONTROL =====
const volumeSlider = document.getElementById("volume");
const bgMusic = document.getElementById("bg-music"); // Replace with your actual background music element ID

function updateVolumeFill() {
  if (volumeSlider && bgMusic) {
    const value = volumeSlider.value;
    bgMusic.volume = value / 100;
  }
}

if (volumeSlider) {
  volumeSlider.addEventListener('input', updateVolumeFill);
  updateVolumeFill(); // Initialize on load
}


const sfxVolumeSlider = document.getElementById("sfx-volume");
const sfxAudio = document.getElementById("sfx-audio"); // Replace with your actual SFX audio element ID

function updateSFXVolumeFill() {
  if (sfxVolumeSlider && sfxAudio) {
    const value = sfxVolumeSlider.value;
    sfxAudio.volume = value / 100;
  }
}

if (sfxVolumeSlider) {
  sfxVolumeSlider.addEventListener('input', updateSFXVolumeFill);
  updateSFXVolumeFill(); // Initialize on load
}


// ===== MUTE CHECKBOX FOR BGM =====
// Function to toggle mute on and off for BGM
function toggleMuteCheckbox(event) {
  const muteCheckbox = event.target;  // Get the checkbox element
  if (bgMusic) {
    if (muteCheckbox.checked) {
      bgMusic.muted = true;  // Mute the audio
    } else {
      bgMusic.muted = false;  // Unmute the audio
    }
  }
}

// Assuming you have a checkbox with id 'muteCheckbox'
const muteCheckbox = document.getElementById("muteCheckbox");
if (muteCheckbox) {
  muteCheckbox.addEventListener("change", toggleMuteCheckbox);
}

// ===== MUTE CHECKBOX FOR SFX =====
// Function to toggle mute on and off for SFX
let isSfxMuted = false; // Track the mute state for SFX
const sfxMuteCheckbox = document.getElementById("sfxMuteCheckbox"); // Get the checkbox for SFX mute

function toggleSfxMuteCheckbox(event) {
  const muteCheckbox = event.target;
  isSfxMuted = muteCheckbox.checked;
  // Here you would have to mute/unmute your SFX logic, assuming you have a function to control SFX volume
  // For example, if you're using a global SFX volume manager, update its state
  if (isSfxMuted) {
    // Mute SFX (assuming you have a global SFX manager)
  } else {
    // Unmute SFX
  }
}

if (sfxMuteCheckbox) {
  sfxMuteCheckbox.addEventListener("change", toggleSfxMuteCheckbox);
}

// Apply settings without closing the menu
function applySettings() {
  playButtonClickSound();
  const volume = volumeSlider.value;
  console.log("Volume:", volume);
}

// ===== GAME CONTROL =====
function restartGame() {
  playButtonClickSound();
  document.getElementById('bg-music')?.pause();
  playExitAnimationAndNavigate('reload');
}

function goToMainMenu() {
  // Pause background music
  document.getElementById('bg-music')?.pause();

  playButtonClickSound();
  const routePaths = document.getElementById("route-paths").dataset;

  // Create a loading overlay with blur effect
  const loadingOverlay = document.createElement('div');
  loadingOverlay.style.position = 'fixed';
  loadingOverlay.style.top = '0';
  loadingOverlay.style.left = '0';
  loadingOverlay.style.width = '100vw';
  loadingOverlay.style.height = '100vh';
  loadingOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
  loadingOverlay.style.backdropFilter = 'blur(10px)';
  loadingOverlay.style.webkitBackdropFilter = 'blur(10px)';
  loadingOverlay.style.display = 'flex';
  loadingOverlay.style.justifyContent = 'center';
  loadingOverlay.style.alignItems = 'center';
  loadingOverlay.style.zIndex = '9999';

  // Create the top and bottom images
  const topHalf = document.createElement('img');
  topHalf.src = '/static/images/anim/loading/up.png';
  topHalf.style.position = 'absolute';
  topHalf.style.top = '0';
  topHalf.style.left = '0';
  topHalf.style.width = '100vw';
  topHalf.style.height = '50%';
  topHalf.style.objectFit = 'fill';
  topHalf.style.transition = 'transform 2s ease';
  topHalf.style.willChange = 'transform';

  const bottomHalf = document.createElement('img');
  bottomHalf.src = '/static/images/anim/loading/down.png';
  bottomHalf.style.position = 'absolute';
  bottomHalf.style.bottom = '0';
  bottomHalf.style.left = '0';
  bottomHalf.style.width = '100vw';
  bottomHalf.style.height = '50%';
  bottomHalf.style.objectFit = 'fill';
  bottomHalf.style.transition = 'transform 2s ease';
  bottomHalf.style.willChange = 'transform';

  loadingOverlay.appendChild(topHalf);
  loadingOverlay.appendChild(bottomHalf);
  document.body.appendChild(loadingOverlay);

  // 🔊 Play loading SFX (same as stage enter)
  window.playSound('/static/sfx/loading.mp3', 0);

  // Force layout reflow
  void topHalf.offsetHeight;

  // Animate the split screen
  setTimeout(() => {
    topHalf.style.transform = 'translateY(-100%)';
    bottomHalf.style.transform = 'translateY(100%)';
  }, 0);

  // Navigate after animation
  setTimeout(() => {
    window.location.href = routePaths.dashboard;
  }, 2300);
}

// ===== MENU OVERLAY HANDLING =====
function toggleMenu() {
  playButtonClickSound();
  const overlay = document.getElementById("menuOverlay");
  const menuButton = document.getElementById("menuButton");
  overlay.classList.toggle("hidden");
  menuButton.style.display = overlay.classList.contains("hidden") ? "block" : "none";
}

// Function to close the menu and resume the game
function closeOverlayAndResume() {
  playButtonClickSound();
  const overlay = document.getElementById("menuOverlay");
  const gameMenu = document.getElementById("gameMenu");
  const menuButton = document.getElementById("menuButton");

  overlay.classList.add("hidden");
  gameMenu.classList.remove("hidden");
  menuButton.style.display = "block";
}

// New function for resume functionality (same as closeOverlayAndResume)
function resumeGame() {
  closeOverlayAndResume(); // Already plays click sound
}

// ===== ESC KEY FUNCTIONALITY =====
document.addEventListener('keydown', function(event) {
  if (event.key === "Escape") {
    resumeGame(); // Trigger the resumeGame function when ESC is pressed
  }
});









  document.querySelectorAll('.freeze-potion, .health-potion, .thunder-potion').forEach(potion => {
    potion.addEventListener('click', () => {
      potion.classList.remove('potion-clicked');
      void potion.offsetWidth; // Force reflow to restart animation
      potion.classList.add('potion-clicked');

      setTimeout(() => {
        potion.classList.remove('potion-clicked');
      }, 300); // Match with pop animation duration
    });
  });



  function playButtonClickSound() {
    const originalSound = document.getElementById('buttonClickSound');
    const soundClone = originalSound.cloneNode(); // clone the <audio> element
    soundClone.volume = 1;
    soundClone.playbackRate = 2;

    // Play the cloned audio
    soundClone.play().catch((e) => {
        // Handle autoplay restrictions or other errors
        console.error('Playback failed:', e);
    });
}


    

  function addToInput(value) {
    const inputField = document.getElementById('number-input');
    inputField.value += value;
  }

  function backspace() {
    const inputField = document.getElementById('number-input');
    if (inputField.selectionStart !== inputField.selectionEnd) {
      inputField.value = '';
    } else {
      inputField.value = inputField.value.slice(0, -1);
    }
  }



  document.addEventListener('keydown', function(event) {
    const inputField = document.getElementById('number-input');
    if (event.ctrlKey) {
      if (event.key.toLowerCase() === 'a') {
        event.preventDefault();
        inputField.select();
      }
      return;
    }

    if (event.repeat) return;

    if (event.key === 'Backspace') {
      event.preventDefault();
      backspace();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      handleAttack();
      return;
    }

    if (event.key.length === 1) {
      if ((event.key >= '0' && event.key <= '9') || event.key === '.') {
        event.preventDefault();
        addToInput(event.key);
      } else {
        event.preventDefault();
      }
    }
  });

// Function to handle showing feedback
let feedbackTimeout; // Global variable to store the timeout ID

function showFeedback(message, duration = 3000) { // Default duration set to 3000ms (3 seconds)
  const feedback = document.getElementById('feedback');

  // Clear previous feedback message if it's still displayed
  if (feedbackTimeout) {
    clearTimeout(feedbackTimeout); // Clear the previous timeout
    feedback.innerText = ''; // Clear previous feedback message immediately
  }

  // Display the new feedback message
  feedback.innerText = message;

  // Set the timeout to clear the feedback after the specified duration
  feedbackTimeout = setTimeout(() => {
    feedback.innerText = ''; // Clear feedback after duration
  }, duration);
}


const correctSuggestions = [
  "Wooooo! You did it! Counticus is impressed with your magical math powers!",
  "Bravo, young wizard! You're on your way to becoming a true math master!",
  "Hooray! Your math skills are growing stronger with each answer!",
  "Boom! Counticus is cheering for you! Keep casting those correct answers!",
  "Superb work, math wizard! You’ve unlocked a new level of awesome!",
  "Yes! You’ve mastered this spell! Now let's conquer the next challenge!",
  "Magic at work! Counticus says ‘Well done!’ Keep going!",
  "Perfect spell cast! Keep it up and you'll be a math legend!",
  "Amazing! Counticus is giving you a big thumbs up!",
  "Fantastic! Your magic powers are unstoppable! Ready for more?",
  "Yay! Another win! Keep your wand at the ready for the next adventure!",
  "You're on fire! Counticus says ‘Great job! Keep shining, wizard!’",
  "Excellent! You’ve done it like a true wizard-in-training!",
  "Awesome! Counticus believes you're one step closer to being a math hero!",
  "Look at you go! You've mastered the art of numbers!"
];


const wrongSuggestions = [
  "Oops! Looks like the spell needs a little more practice. Let’s try again!",
  "Hmm, not quite, young wizard. Try breaking the problem down and casting your answer again.",
  "Oh no! Looks like the numbers got tricky! Maybe Counticus can offer a helping spell?",
  "Close, but no magic yet! Counticus says to check your math signs and give it another shot!",
  "Don’t worry! Every mistake is a step toward becoming a math wizard! Try again with a fresh spell!",
  "It’s okay! Mistakes are part of the learning process. Counticus is here to help!",
  "Whoops! Take a deep breath, check your work, and try a new approach with Counticus' guidance.",
  "Hmm, something’s a bit off. Try breaking it down into smaller steps and ask Counticus for help!",
  "Oh no, but don't worry! Let’s take a deep breath and try again — Counticus will show the way!",
  "Close! Check your math signs carefully, and ask Counticus to guide you through it!",
  "Don’t give up, young wizard! You’ve got this! Try again and let Counticus help you along the way!",
  "It’s okay to make mistakes, but you’re getting better every time! Ready to try again?",
  "Hmm, not quite, but you’re getting close! Counticus suggests trying a different approach!",
  "Uh-oh, looks like we missed a step. Let’s try counting on our fingers or asking Counticus!",
  "Not the right spell just yet, but Counticus believes in your math magic! Try again!",
  "Take your time and check the numbers again — Counticus is cheering you on!"
];


// Show the speech bubble with the appropriate suggestion
let speechBubbleTimeout; // Global variable to store the timeout ID

function showSpeechBubble(isCorrect) {
  const bubble = document.getElementById('speech-bubble');
  const suggestions = isCorrect ? correctSuggestions : wrongSuggestions;
  const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];

  // Dynamic title based on correctness
  const title = isCorrect ? 
    "<strong>Well done, math wizard!</strong>" : 
    "<strong>Hmm, need a little help?</strong>";

  // Combine title and suggestion text with added margin at the bottom for spacing
  bubble.innerHTML = `
    <p>${title}</p>
    <p>${randomSuggestion}</p>
  `;
  
  // Add margin to the bottom of the paragraphs
  const paragraphs = bubble.getElementsByTagName('p');
  for (let p of paragraphs) {
    p.style.marginBottom = '1.5vh'; // Space between title and suggestion
  }

  bubble.style.display = 'block'; // Show the bubble

  // Clear any existing timeout before setting a new one
  if (speechBubbleTimeout) {
    clearTimeout(speechBubbleTimeout);
  }

  // Set a new timeout to hide the bubble after 5 seconds
  speechBubbleTimeout = setTimeout(() => {
    bubble.style.display = 'none'; // Hide the bubble after 5 seconds
  }, 5000); // 5 seconds
}



// Example of how you would use it when the user answers a question
  function handleAnswer(input, correctAnswer) {
    const isCorrect = input === correctAnswer;
    // Show the speech bubble with the appropriate suggestion
    showSpeechBubble(isCorrect);

    // Your other game logic, such as updating score, etc.
  }

// Ensure that the bubble is initially hidden when the game starts
window.onload = function() {
  
  const bubble = document.getElementById('speech-bubble');
  bubble.style.display = 'none'; // Initially hide the speech bubble
};



