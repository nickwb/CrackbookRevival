var DIMMER_DIV_ID = "_crackbook_dimmer_";
var DIMMER_TEXT = "Wait %d seconds for the content to appear.";
var DIMMER_SWITCH_TEXT = "The timer restarts if you switch away from this tab.";

var original_url = null;
var dimmer_options = {};

var dimmer_timer = null;
var media_timer = null;

function getDimmer() {
  return document.getElementById(DIMMER_DIV_ID);
}

function getOrCreateDimmer() {
  var dimmer = getDimmer();
  if (dimmer) {
    return dimmer;
  }

  dimmer = document.createElement("div");
  dimmer.id = DIMMER_DIV_ID;

  var main_text = document.createElement("div");
  main_text.className = "crackbook_main_text";
  dimmer.appendChild(main_text);
  dimmer.main_text = main_text;

  var switch_text = document.createElement("div");
  switch_text.className = "crackbook_switch_text";
  switch_text.innerText = DIMMER_SWITCH_TEXT;
  dimmer.appendChild(switch_text);
  dimmer.switch_text = switch_text;

  // The stopAnimating flag is used to stop the animation,
  // without stopping part-way through the animation
  switch_text.stopAnimating = false;
  switch_text.addEventListener("animationiteration", function() {
    if (switch_text.stopAnimating) {
      switch_text.classList.remove("animating");
      switch_text.stopAnimating = false;
    }
  });

  if (dimmer_options.blurBackground) {
    dimmer.classList.add("blur-bg");
  }

  document.body.insertBefore(dimmer, document.body.firstChild);
  return dimmer;
}

function beginBlocking(suspend) {
  var delay = dimmer_options.delay;
  var dimmer = getOrCreateDimmer();

  // Make sure the dimmer is shown
  dimmer.classList.add("shown");

  // Update the timer text
  dimmer.main_text.innerText = DIMMER_TEXT.replace("%d", Math.round(delay));

  // Hide scrollbars
  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";

  // Pause audio/video
  suppressMedia();

  if (!suspend) {
    // If the tab is not suspended, start timing
    clearDimTimer();
    dimmer_timer = setTimeout(endBlocking, Math.round(delay * 1000));
  }
}

function endBlocking() {
  var dimmer = getDimmer();

  // Hide the dimmer
  dimmer.classList.remove("shown");

  // Show scrollbars
  document.body.style.overflow = null;
  document.documentElement.style.overflow = null;

  // Stop polling for media objects
  if (media_timer !== null) {
    window.clearInterval(media_timer);
    media_timer = null;
  }

  clearDimTimer();
}

function clearDimTimer() {
  if (dimmer_timer !== null) {
    clearTimeout(dimmer_timer);
    dimmer_timer = null;
  }
}

function pauseAll() {
  for (var video of document.getElementsByTagName("video")) {
    if (video.autoplay || !video.paused) {
      video.autoplay = false;
      video.pause();
    }
  }

  for (var audio of document.getElementsByTagName("audio")) {
    if (audio.autoplay || !audio.paused) {
      audio.autoplay = false;
      audio.pause();
    }
  }
}

function suppressMedia() {
  pauseAll();

  if (media_timer !== null) {
    window.clearInterval(media_timer);
  }

  // Media elements may be inserted in to the page later...
  media_timer = window.setInterval(pauseAll, 250);
}

function checkUrlForJunk() {
  chrome.runtime.sendMessage({}, function(response) {
    if (response.dimmerAction) {
      // Save dimmer parameters.
      dimmer_options = response.options;
      invoke_dimmer(response.dimmerAction);
    }
  });
}

function watchUrlChanges() {
  if (document.URL != original_url) {
    original_url = document.URL;
    checkUrlForJunk();
  }
}

function onBegin() {
  // On initial load, check with the extension whether action needs to be taken.
  checkUrlForJunk();

  // Install URL change watcher.
  original_url = document.URL;
  setInterval(watchUrlChanges, 1000);
}

function revealSwitchText(dimmer) {
  dimmer.switch_text.classList.add("shown");

  // Animate one more time, then stop the suspended animation
  setTimeout(function() {
    dimmer.switch_text.stopAnimating = true;
  }, 500);
}

function suspend() {
  clearDimTimer();

  // Start the suspended animation
  var dimmer = getDimmer();
  if (dimmer && dimmer.switch_text.classList.contains("shown")) {
    dimmer.switch_text.stopAnimating = false;
    dimmer.switch_text.classList.add("animating");
  }
}

function resume() {
  var dimmer = getDimmer();
  // If the dimmer is already hidden, then the delay has already been paid by the user
  if (dimmer && dimmer.classList.contains("shown")) {
    revealSwitchText(dimmer);
    beginBlocking(false);
  }
}

/* Dims the current page for a given time in seconds

   'action' is one of the following:
     - "create": a dimmer is created on the page if it is not already there and a timer is started
     - "create_suspended": a dimmer is created on the page if it is not already there, no timer is started
     - "suspend": the countdown is suspended if there is a dimmer on the page, no-op otherwise
     - "resume": the countdown is resumed if there is a dimmer on the page, no-op otherwise

 */
function invoke_dimmer(action) {
  if (action === "create") {
    beginBlocking(false);
  } else if (action === "create_suspended") {
    beginBlocking(true);
  } else if (action === "suspend") {
    suspend();
  } else if (action === "resume") {
    resume();
  }
}

// Mostly borrowed from: https://github.com/bendrucker/document-ready
function ready(callback) {
  var state = document.readyState;
  if (state === "complete" || state === "interactive") {
    return setTimeout(callback, 0);
  }

  document.addEventListener("DOMContentLoaded", callback);
}

ready(onBegin);
