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

  // Message
  dimmer.style.color = "#ffffff";
  dimmer.style.paddingTop = window.innerHeight / 2 - 30 + "px";
  dimmer.style.fontSize = "36px";
  dimmer.style.fontFamily = "Georgia";
  dimmer.style.fontVariant = "normal";

  var main_text = document.createElement("div");
  main_text.style.textAlign = "center";
  main_text.style.paddingTop = "50px";
  main_text.style.fontSize = "20px";
  dimmer.appendChild(main_text);
  dimmer.main_text = main_text;

  var switch_text = document.createElement("div");
  switch_text.innerText = DIMMER_SWITCH_TEXT;
  switch_text.style.display = "none";
  switch_text.style.textAlign = "center";
  switch_text.style.paddingTop = "10px";
  switch_text.style.fontSize = "14px";
  switch_text.style.color = "#aaaaaa";
  dimmer.appendChild(switch_text);
  dimmer.switch_text = switch_text;

  // Positioning.
  dimmer.style.position = "fixed";
  dimmer.style.top = "0px";
  dimmer.style.left = "0px";
  dimmer.style.width = "100%";
  dimmer.style.height = "100%";

  // Background.
  dimmer.style.zIndex = "2147483647";
  dimmer.style.background = "#001000";
  if (dimmer_options.blurBackground) {
    dimmer.style.background = "rgba(0, 16, 0, .6)";
    dimmer.style.backdropFilter = "blur(10px)";
  }

  document.body.insertBefore(dimmer, document.body.firstChild);
  return dimmer;
}

function beginBlocking(suspend) {
  var delay = dimmer_options.delay;
  var dimmer = getOrCreateDimmer();

  // Make sure the dimmer is shown
  dimmer.style.display = "block";

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
  dimmer.style.display = "none";

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

function resume() {
  var dimmer = getDimmer();
  // If the dimmer is already hidden, then the delay has already been paid by the user
  if (dimmer && dimmer.style.display !== "none") {
    dimmer.switch_text.style.display = "block";
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
    clearDimTimer();
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
