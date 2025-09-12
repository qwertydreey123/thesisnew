document.addEventListener('DOMContentLoaded', async () => {
  let pageKey = document.body.dataset.page || 'generic';
  const isGamePage = window.location.pathname.startsWith('/game');
  if (isGamePage) pageKey = 'game';

  // Always check backend
  try {
    const resp = await fetch(`/api/tutorial-status?tutorialKey=${encodeURIComponent(pageKey)}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.tutorial_done) {
        return; // tutorial done, skip showing
      }
    }
  } catch (e) {
    console.warn('Failed to check tutorial status from backend', e);
    // Optionally continue with tutorial anyway
  }

  const stepsByPage = {
    dashboard: [
      { element: '.dashboard-btn.shop', text: 'You can buy items or power-ups here in the Shop — coming soon!' },
      { element: '.dashboard-btn.monsters', text: 'This is the Monster Atlas — like an encyclopedia!' },
      { element: '.dashboard-btn.collections', text: 'Here you can see the collectibles you’ve unlocked!' },
      { element: '.dashboard-btn.profile', text: 'This is your Profile.' },
      { element: '.dashboard-btn.settings', text: 'Update info coming soon.' },
      { element: '.dashboard-btn.adventure', text: 'This is Adventure Mode. Start your journey here!' },

    ],
    shop: [
      { element: '.shop-btn.health', text: 'This is the Health Potion button. It heals your wounds after math battles!' },
      { element: '.shop-btn.thunder', text: 'This is the Thunder Potion button. Zap monsters with math power!' },
      { element: '.shop-btn.freeze', text: 'This is the Freeze Potion button. Freeze enemies and buy time to plan!' },
    ],
    monsterAtlas: [
      { element: '.map-btn.btn-addition', text: 'These are subject tomes. Click Addition to see monsters for that topic.' },
      { element: '.map-btn.btn-subtraction', text: 'Subtraction monsters live here. Try clicking it!' },
      { element: '.map-btn.btn-multiplication', text: 'Multiplication monsters are here!' },
      { element: '.map-btn.btn-division', text: 'Division monsters await your challenge!' },
      { element: '.map-btn.btn-counting', text: 'This tome reveals counting monsters!' },
      { element: '.map-btn.btn-comparison', text: 'Comparison monsters are clever tricksters!' },
      { element: '.map-btn.btn-numerals', text: 'Roman numeral monsters hide here!' },
      { element: '.map-btn.btn-placevalue', text: 'Place value monsters dwell in this tome!' },
      { element: '.monster-details-wrapper', text: 'This ancient scroll holds all the monster details. Keep an eye on it!' },
      { element: '#monster-image', text: 'Here is the monster image. Check out your monster!' }


    ],
    collectibles: [
      {
        element: '#medals-grid',
        text: 'These are the badges you earn after completing each map stage!',
      },
      {
        action: async (nextStep) => {
          showSection('skins-section');
          await new Promise((resolve) => {
            const maxWait = 2000;
            const intervalTime = 50;
            let waited = 0;

            const interval = setInterval(() => {
              const skinImg = document.getElementById('skin-image');
              if (skinImg && skinImg.offsetParent !== null) {
                clearInterval(interval);
                resolve();
              } else if (waited >= maxWait) {
                clearInterval(interval);
                resolve();
              }
              waited += intervalTime;
            }, intervalTime);
          });

          if (typeof nextStep === 'function') nextStep();
        },
      },
      {
        element: '#skin-image',
        text: 'This is your current skin! You can unlock and equip more by completing maps.',
      }
    ],
    roadmap: [
      { element: '.roadmap-btn.multiplication-mirage', text: 'Multiplication Mirage holds powerful multiplication beasts!' },
      { element: '.roadmap-btn.place-value-town', text: 'Place Value Town helps you understand number positions!' },
      { element: '.roadmap-btn.comparison-cliffs', text: 'Comparison Cliffs is where tricky comparing monsters live!' },
      { element: '.roadmap-btn.addition-village', text: 'This is the Addition Village. Begin your math adventure here!' },
      { element: '.roadmap-btn.subtraction-sands', text: 'Welcome to Subtraction Sands! Practice subtracting monsters here.' },
      { element: '.roadmap-btn.counting-springs', text: 'Counting Springs is perfect for learning to count with fun!' },
      { element: '.roadmap-btn.numeral-ruins', text: 'Roman Numeral Ruins is full of ancient numeral challenges!' },
      { element: '.roadmap-btn.division-river', text: 'Division River will test your skills in splitting numbers!' }
    ],

    // EXAMPLE: specific dynamic map-stage combo
    game: [
      { element: '.question-container', text: 'Here’s your question! Solve it to attack.', scrollBehavior: 'force', waitBefore: 800 },
      { element: '.freeze-potion', text: 'The Freeze Potion gives you extra time to answer the question!' },
      { element: '#freeze-quantity', text: 'This shows how many Freeze Potions you have left!' },
      { element: '.health-potion', text: 'This is the Health Potion. It heals you when you’re low on health!' },
      { element: '#health-quantity', text: 'This shows how many Health Potions you can still use!' },
      { element: '.thunder-potion', text: 'Use the Thunder Potion to deal a strong attack after answering!' },
      { element: '#thunder-quantity', text: 'This shows how many Thunder Potions are available to you!' },
      { element: '.game-control-container', text: 'Use this number pad to input your answer and attack!' },
      { element: '.chatbot-img', text: 'This is your AI Chatbot Tutor. It gives you hints and encouragement!' },
      { element: '#player-idle', text: 'Here’s your character! Ready to cast spells and solve math!' },
      { element: '#player-health', text: 'This bar shows your health. Keep it from running out to stay in the fight!' },
      { element: '#monster-sprite', text: 'This is your monster opponent. Defeat it by answering questions correctly!' },
      { element: '#monster-health', text: 'This is the monster’s health bar. Reduce it to zero to win!' },
      { element: '#difficulty-display', text: 'This displays the current difficulty level. It adjusts as you play!' },
      { element: '.menu-btn', text: 'Click this Menu button to access settings and other features anytime.' }
    ]

    
  };

  const steps = stepsByPage[pageKey] || [];

  if (!steps.length) return;
  
    startTutorial();
  
    function startTutorial() {
      let step = 0;
  
      // Inject CSS styles
      const style = document.createElement('style');
style.textContent = `
  .tutorial-highlight-box {
    position: absolute;
    border: 0.6vh solid yellow;
    border-radius: 1.5vh;
    box-shadow: 0 0 2vh 0.7vh gold;
    pointer-events: none;
    transition: top 0.3s, left 0.3s, width 0.3s, height 0.3s;
    z-index: 9999;
    background: transparent;
  }

  .tutorial-highlight-glow {
    transition: top 0.3s, left 0.3s, width 0.3s, height 0.3s, filter 0.3s;
    border-radius: 1.5vh;
    pointer-events: none;
    filter: drop-shadow(0 0 1vh gold) drop-shadow(0 0 1.5vh yellow);
    z-index: 10000;
    position: absolute;
  }

  #tutorial-overlay {
    position: fixed;
    top: 0; left: 0;
    width: 100%;
    height: 100vh;
    background: rgba(0, 0, 0, 0.7);
    z-index: 9998;
  }

  #tutorial-popup {
    position: fixed;
    background: #fff;
    padding: 2vh;
    border-radius: 1.5vh;
    max-width: 40vh;
    text-align: center;
    box-shadow: 0 0 1.5vh rgba(0, 0, 0, 0.3);
    z-index: 10001;
    pointer-events: auto;
  }

  #tutorial-popup p {
    transition: opacity 0.3s ease;
    margin-bottom: 1.5vh;
    font-size: 1.8vh;
  }

  #tutorial-popup button {
    padding: 1vh 2vh;
    border: none;
    border-radius: 1vh;
    cursor: pointer;
    margin: 0 1vh;
    font-weight: 600;
    font-size: 1.6vh;
    transition: background-color 0.2s ease;
  }

  #tutorial-popup button.next {
    background-color: #4caf50;
    color: white;
  }

  #tutorial-popup button.next:hover {
    background-color: #45a049;
  }

  #tutorial-popup button.skip {
    background-color: #ccc;
    color: #333;
  }

  #tutorial-popup button.skip:hover {
    background-color: #b3b3b3;
  }
`;
      document.head.appendChild(style);
  
      const overlay = document.createElement('div');
      overlay.id = 'tutorial-overlay';
      document.body.appendChild(overlay);
  
      const popup = document.createElement('div');
      popup.id = 'tutorial-popup';
  
      const text = document.createElement('p');
      popup.appendChild(text);
  
      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Next';
      nextBtn.className = 'next';
      popup.appendChild(nextBtn);
  
      const skipBtn = document.createElement('button');
      skipBtn.textContent = 'Skip';
      skipBtn.className = 'skip';
      popup.appendChild(skipBtn);
  
      document.body.appendChild(popup);
  
      function positionPopupNear(rect) {
        const popupWidth = popup.offsetWidth || 300;
        const popupHeight = popup.offsetHeight || 120;
        const spacing = 10;
  
        let top = rect.top - popupHeight - spacing;
        if (top < 10) top = rect.bottom + spacing;
  
        let left = rect.left + rect.width / 2 - popupWidth / 2;
        const minLeft = 10;
        const maxLeft = window.innerWidth - popupWidth - 10;
        if (left < minLeft) left = minLeft;
        if (left > maxLeft) left = maxLeft;
  
        popup.style.top = `${top}px`;  // Fix template literal usage
        popup.style.left = `${left}px`;
      }
      function waitForQuestionContainerThenStart(stepCallback) {
        const questionContainer = document.querySelector('.question-container');
        
        if (!questionContainer) return;
      
        // Listen for animation end
        questionContainer.addEventListener('animationend', () => {
          // Optional: force transform reset if needed
          questionContainer.style.transform = 'none';
      
          // Now run the tutorial step
          stepCallback();
        }, { once: true }); // only trigger once
      }
      function minimalScrollToView(rect, behavior = 'minimal') {
        if (behavior === 'force') {
          const scrollY = rect.top + window.pageYOffset - 60;
          window.scrollTo({ top: scrollY, behavior: 'smooth' });
        } else {
          const viewportHeight = window.innerHeight;
          if (rect.top < 0) {
            window.scrollBy({ top: rect.top - 10, behavior: 'smooth' });
          } else if (rect.bottom > viewportHeight) {
            window.scrollBy({ top: rect.bottom - viewportHeight + 10, behavior: 'smooth' });
          }
        }
      }
      
  
      function showStep(index) {
        const step = steps[index];
        if (!step) return;
      
        if (step.action) {
          step.action(() => showStep(index + 1));
          return;
        }
      
        const target = document.querySelector(step.element);
        if (!target) return;
      
        if (step.element === '.question-container') {
          const computedStyle = window.getComputedStyle(target);
          if (computedStyle.animationName === 'smoothBungeeDrop' && computedStyle.animationPlayState === 'running') {
            // Hide popup until animation ends
            hidePopupAndHighlight();
        
            target.addEventListener('animationend', () => {
              createHighlightCloneAndShow(target, step);
            }, { once: true });
            return;
          }
        }
        
      
        createHighlightCloneAndShow(target, step);
      }
      

      
      
      function createHighlightCloneAndShow(target, step) {
        text.textContent = step.text;
      
        // Remove old highlight if any
        const oldHighlight = document.querySelector('.tutorial-highlight-glow');
        if (oldHighlight) oldHighlight.remove();
      
        const rect = target.getBoundingClientRect();
      
        const clone = target.cloneNode(true);
        clone.classList.add('tutorial-highlight-glow');
      
        clone.style.position = 'fixed';
        clone.style.top = `${rect.top}px`;
        clone.style.left = `${rect.left}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        clone.style.margin = '0';
        clone.style.pointerEvents = 'none';
        clone.style.zIndex = '10000';
      
        // Remove animations and transforms on clone
        clone.style.animation = 'none';
        clone.style.transform = 'none';
      
        document.body.appendChild(clone);
      
        minimalScrollToView(rect, step.scrollBehavior);
      
        // Wait a tick before positioning popup to account for scrolling
        setTimeout(() => positionPopupNear(rect), 0);
      
        if (step.element === '.question-container') {
          const questionText = clone.querySelector('.question-text');
          if (questionText) {
            questionText.style.opacity = '1';
            questionText.style.transition = 'none';
          }
        }
      
        // Make sure popup is visible now
        showPopup();
      }
      
      function showPopup() {
        const popup = document.getElementById('tutorial-popup');
        if (popup) popup.style.display = 'block';
      }
      
      function hidePopupAndHighlight() {
        const oldHighlight = document.querySelector('.tutorial-highlight-glow');
        if (oldHighlight) oldHighlight.remove();
      
        const popup = document.getElementById('tutorial-popup');
        if (popup) popup.style.display = 'none';
      }
      
      
      
      
  
      nextBtn.addEventListener('click', () => {
        step++;
        if (step >= steps.length) {
          endTutorial();
        } else {
          showStep(step);
        }
      });
  
      skipBtn.addEventListener('click', endTutorial);
  

      function endTutorial() {
        // Don't set localStorage anymore
    
        fetch('/api/tutorial-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tutorialKey: pageKey })
        }).catch(() => console.warn('Failed to notify backend of tutorial completion'));
    
        overlay.remove();
        popup.remove();
        const oldHighlight = document.querySelector('.tutorial-highlight-glow');
        if (oldHighlight) oldHighlight.remove();
      }
      
      // ... rest of tutorial start & step functions ...

  
      showStep(step);
    }
  });
  