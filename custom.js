// console.log("custom.js loaded");

function overrideFooterSecondDiv() {
  const footer = document.getElementById("footer");
  if (!footer) return;

  const secondDiv = footer.querySelectorAll("div")[1]; // second div in footer
  if (secondDiv) {
    const link = secondDiv.querySelector("a");
    if (link) {
      // console.log("Overriding footer link:", link);
      link.textContent = "Powered by Tars";
      link.href = "https://hellotars.com";
    } else {
      // console.log("Footer link not found inside second div yet.");
    }
  }
}

function delayedOverride() {
  setTimeout(overrideFooterSecondDiv, 1000); // wait 1s
}

// Run on initial load
delayedOverride();

// Patch pushState and replaceState to catch SPA navigation
(function (history) {
  const pushState = history.pushState;
  history.pushState = function () {
    const ret = pushState.apply(this, arguments);
    // console.log("[pushState called]", window.location.href);
    delayedOverride();
    return ret;
  };

  const replaceState = history.replaceState;
  history.replaceState = function () {
    const ret = replaceState.apply(this, arguments);
    // console.log("[replaceState called]", window.location.href);
    delayedOverride();
    return ret;
  };
})(window.history);

// Handle back/forward navigation
window.addEventListener("popstate", () => {
  // console.log("[popstate fired]", window.location.href);
  delayedOverride();
});


//function to add the chatbot to docs
(function () {
  var js,fs,d = document,id = "tars-widget-script",b = "https://tars-file-upload.s3.amazonaws.com/bulb/";
  if (!d.getElementById(id)) {
    js = d.createElement("script");
    js.id = id;
    js.type = "text/javascript";
    js.src = b + "js/widget.js";
    fs = d.getElementsByTagName("script")[0];
    fs.parentNode.insertBefore(js, fs);
  }
})();
window.tarsSettings = { convid: "1sfwNs" };

//trigger chatbot open when clicking on other elements

