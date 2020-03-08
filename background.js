var HITNUM_FONT = "12px Arial Bold";
var HITNUM_COLOR = "rgb(255,255,255)";
var HITNUM_POS_X = 3;
var HITNUM_POS_Y = 12;
var NOTIFICATION_TEXT = "Time to get back to work!";

// TODO: the following should be configurable

var NOTIFICATION_THRESHOLD = 5;
var NOTIFICATION_HIT_INTERVAL = 5;

function drawIcon(img_name) {
  img_path = "images/" + img_name;
  chrome.browserAction.setIcon({ path: img_path });
} // drawIcon

function drawTextOnBg(canvas, image, value) {
  var ctx = canvas.getContext("2d");

  ctx.drawImage(image, 0, 0);

  ctx.font = HITNUM_FONT;
  ctx.fillStyle = HITNUM_COLOR;
  ctx.fillText("" + value, HITNUM_POS_X, HITNUM_POS_Y);

  var imageData = ctx.getImageData(0, 0, 19, 19);
  chrome.browserAction.setIcon({ imageData: imageData });
} // drawTextOnBg

var iconState = null;

function updateIcon(active, inJunk) {
  if (active === null)
    // null or undefined
    active = extensionActive();
  if (inJunk === null) {
    // null or undefined
    getActiveTab().then(
      tab => {
        var junkDomain = lookupJunkDomain(tab.url);
        updateIcon(active, !!junkDomain);
      },
      () => {}
    );
    return;
  }

  var newIcon = null;

  newIcon = inJunk ? "hamburger" : "carrot";
  if (!active) newIcon += "-inactive";
  newIcon += "-19px.png";

  if (iconState != newIcon) {
    iconState = newIcon;
    drawIcon(newIcon);
  }
}

function extensionActive() {
  var now = new Date();
  // Check weekday.
  if (getLocal("weekdays").indexOf("" + now.getDay()) == -1) return false;
  // Check time.
  var nowMins = parseTime(now.getHours() + ":" + now.getMinutes());
  var startTime = getLocal("startTime");
  var endTime = getLocal("endTime");
  if (startTime <= endTime) {
    return startTime <= nowMins && nowMins <= endTime;
  } else {
    // Handle the case when, e.g. the end time is in the night (14:00-3:00).
    return startTime <= nowMins || nowMins <= endTime;
  }
}

function shouldDimPage() {
  return getTodaysHits() >= getLocal("dimmerThreshold");
}

function registerHit(domain, blocked, active) {
  storeHit(domain, blocked, active);
}

// Returns true if the URL looks normal.
// Used to avoid trying to dim special-purpose tabs.
function isNormalUrl(s) {
  return s && (s.indexOf("http://") === 0 || s.indexOf("https://") === 0);
}

/*
 * Dimmer state transitions for junk pages
 *
 * handleNewPage:
 *  - tab active --> enable dimmer
 *  - tab inactive --> enable dimmer, suspend timer
 *
 * tabSelectionChangedHandler:
 *  - suspend timer on previous tab
 *  - restart timer on new tab
 *
 * windowFocusChangedHandler:
 *  - suspend timer on previous tab
 *  - restart timer on active tab
 *
 */

var lastDimmedTabId = null;
var suspendedTabs = {};

function handleNewPage(newTab, selectedTab, sendResponse) {
  // Every code path in this function should call sendResponse.
  // Collect data.
  var junkDomain = lookupJunkDomain(newTab.url);
  var active = extensionActive();
  var shouldDim = shouldDimPage();
  if (!junkDomain && getLocal("checkActiveTab")) {
    junkDomain = lookupJunkDomain(selectedTab.url);
    // TODO: This works for "open in background tab", but not for "open in
    // foreground tab" or "open in new window". Cover these cases by checking
    // the last seen tab, not just the active tab, and whether the switch was
    // recent.
    // TODO: This is easy to circumvent by immediately reloading a page. One
    // solution is to add a temporary blacklist of pages / domains.
  }

  updateIcon(null, !!junkDomain);

  var responseSent = false;

  if (junkDomain) {
    registerHit(junkDomain, shouldDim, active);

    if (active) {
      incrementJunkCounter(junkDomain);

      if (shouldDim) {
        var tabIsActive = newTab.id == selectedTab.id;

        sendResponse({
          dimmerAction: tabIsActive ? "create" : "create_suspended",
          options: {
            blurBackground: getLocal("blurBackground"),
            delay: getLocal("dimmerDelay")
          }
        });

        responseSent = true;

        if (tabIsActive) {
          lastDimmedTabId = newTab.id;
        } else {
          suspendedTabs[newTab.id] = true;
        }

        increaseDimmerDelay();
      }
    }
  }

  if (!responseSent) {
    sendResponse({}); // do nothing
  }
}

function increaseDimmerDelay() {
  var newDelay = getLocal("dimmerDelay") + getLocal("dimmerDelayIncrement");
  setLocal("dimmerDelay", newDelay);
}

function onTabChange(newTab) {
  // Maybe suspend the tab we switched away from
  if (lastDimmedTabId && lastDimmedTabId !== newTab.id) {
    invokeDimmer(lastDimmedTabId, "suspend");
    suspendedTabs[lastDimmedTabId] = true;
    lastDimmedTabId = null;
  }

  // Maybe resume the tab we switched towards
  // (If it was already suspended)
  if (suspendedTabs[newTab.id]) {
    updateIcon(null, true);
    invokeDimmer(newTab.id, "resume");
    lastDimmedTabId = newTab.id;
    suspendedTabs[newTab.id] = false;
  }
}

function tabSelectionChangedHandler(tabId, _selectInfo) {
  getTabById(tabId).then(onTabChange, () => {});
}

function windowFocusChangedHandler(windowId) {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    onTabChange({
      id: -1,
      url: "chrome://maybe-devtools"
    });
  } else {
    getActiveTab().then(onTabChange, () => {});
  }
}

function tabClosedHandler(tabId, _removeInfo) {
  if (lastDimmedTabId === tabId) {
    lastDimmedTabId = null;
  }
  if (suspendedTabs[tabId] !== undefined) {
    delete suspendedTabs[tabId];
  }
}

// A wrapper function that also figures out the selected tab.
function newPageHandler(_request, sender, sendResponse) {
  getActiveTab().then(
    tab => handleNewPage(sender.tab, tab, sendResponse),
    _ => sendResponse({})
  );
  return true;
}

function showNotification() {
  var notification_obj = webkitNotifications.createNotification(
    "images/hamburger-128px.png",
    NOTIFICATION_TEXT,
    ""
  );
  notification_obj.show();
  window.setTimeout(function() {
    notification_obj.cancel();
  }, 3000);
}

function incrementJunkCounter(domain) {
  var today = todayAsString();
  var day = getLocal("day");
  var hits = getLocal("dayHits");
  if (day == today) {
    hits += 1;
  } else {
    setLocal("day", today);
    hits = 1;
  }
  setLocal("dayHits", hits);

  // Also, if the day changed and reset_daily_flag is set, reset.
  if (day != today && getLocal("reset_daily_flag")) {
    setLocal("dimmerDelay", getLocal("base_delay"));
  }

  chrome.browserAction.setBadgeText({ text: "" + hits });
  setTimeout(function() {
    chrome.browserAction.setBadgeText({ text: "" });
  }, 3000);

  // Show notification if needed.
  if (hits > NOTIFICATION_THRESHOLD && hits % NOTIFICATION_HIT_INTERVAL === 0)
    if (hits < getLocal("dimmerThreshold"))
      // If hits >= dimmerThreshold, the notification is not needed any
      // more as the dimmer kicks in.
      showNotification();
}

function invokeDimmer(tabId, dimmerAction) {
  // Dim the page and start (or restart) the timer.
  //
  // Actions:
  // - "create": a dimmer is created on the page if it is not already there and a timer is started
  // - "create_suspended": a dimmer is created on the page if it is not already there, no timer is started
  // - "suspend": the countdown is suspended if there is a dimmer on the page
  // - "resume": the countdown is resumed if there is a dimmer on the page
  var primer_code = "if (window.invoke_dimmer) { invoke_dimmer('" + dimmerAction + "'); }";

  // Check that the tab still exists
  getTabById(tabId).then(
    _tab => {
      chrome.tabs.executeScript(tabId, { code: primer_code });
    },
    () => {}
  );
}

function initIcon() {
  updateIcon(null, false);
}

function initExtension() {
  chrome.runtime.onMessage.addListener(newPageHandler);
  chrome.tabs.onSelectionChanged.addListener(tabSelectionChangedHandler);
  chrome.tabs.onRemoved.addListener(tabClosedHandler);
  chrome.windows.onFocusChanged.addListener(windowFocusChangedHandler);
  initIcon();

  if (getLocal("first_run") && getLocal("junkDomains").length === 0) {
    chrome.tabs.create({ url: "options.html" });
  }
}

function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true }, results => {
      if (results.length === 0) {
        reject();
      } else {
        resolve(results[0]);
      }
    });
  });
}

function getTabById(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({}, results => {
      const tab = results.find(t => t.id === tabId);
      if (tab) {
        resolve(tab);
      } else {
        reject();
      }
    });
  });
}

initExtension();
