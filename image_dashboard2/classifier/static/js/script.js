const useFileButton = document.getElementById("useFileButton");
const useCameraButton = document.getElementById("useCameraButton");
const fileUploadArea = document.getElementById("fileUploadArea");
const cameraArea = document.getElementById("cameraArea");
const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const videoElement = document.getElementById("videoElement");
const captureButton = document.getElementById("captureButton");
const captureCanvas = document.getElementById("captureCanvas");
const uploadForm = document.getElementById("uploadForm");
const resultsDiv = document.getElementById("results");

let useCamera = false;
let stream = null;
let frameCaptured = false;

// Switch to file upload mode
useFileButton.addEventListener("click", () => {
  useCamera = false;
  useFileButton.classList.add("active");
  useCameraButton.classList.remove("active");
  fileUploadArea.style.display = "block";
  cameraArea.style.display = "none";
  frameCaptured = false;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
});

// Switch to camera mode
useCameraButton.addEventListener("click", async () => {
  useCamera = true;
  useCameraButton.classList.add("active");
  useFileButton.classList.remove("active");
  fileUploadArea.style.display = "none";
  cameraArea.style.display = "flex";
  imagePreview.innerHTML = "";
  frameCaptured = false;
  
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoElement.srcObject = stream;
  } catch (err) {
    console.error("Error accessing camera:", err);
    alert("Unable to access camera. Please check permissions or use a secure (HTTPS) connection.");
  }
});

// Show image preview on file select
imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = e => {
      imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    };
    reader.readAsDataURL(file);
  }
});

// Capture frame from camera
captureButton.addEventListener("click", () => {
  if (!videoElement.videoWidth || !videoElement.videoHeight) {
    alert("Camera not ready yet. Please wait a moment.");
    return;
  }
  const ctx = captureCanvas.getContext("2d");
  captureCanvas.width = videoElement.videoWidth;
  captureCanvas.height = videoElement.videoHeight;
  ctx.drawImage(videoElement, 0, 0);
  frameCaptured = true;
  alert("Frame captured! Now you can run inference.");
});

uploadForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  // Check if any model selected
  const checkedModels = Array.from(this.querySelectorAll('[name="models"]:checked'));
  if (checkedModels.length === 0) {
    alert("Please select at least one model before running inference.");
    return;
  }

  // If using camera, ensure a frame is captured
  if (useCamera && !frameCaptured) {
    alert("Please capture a frame from the camera before running inference.");
    return;
  }

  const formData = new FormData(this);
  const csrftoken = this.querySelector('[name=csrfmiddlewaretoken]').value;
  resultsDiv.innerHTML = "<div class='result-card'><p>Processing... Please wait.</p></div>";

  // If using camera, replace the image in FormData with the captured frame
  if (useCamera && frameCaptured) {
    const blob = await new Promise(res => captureCanvas.toBlob(res, 'image/jpeg'));
    formData.delete("image");
    formData.append("image", blob, "frame.jpg");
  }

  try {
    const response = await fetch("/classify/", {
      method: "POST",
      body: formData,
      headers: {
        'X-CSRFToken': csrftoken
      }
    });

    if (response.ok) {
      const data = await response.json();
      const results = data.results || {};
      const annotatedUrl = data.annotated_url;
      resultsDiv.innerHTML = "";

      // If YOLO selected
      if (results["YOLO"]) {
        // If annotated URL provided
        if (annotatedUrl) {
          const yoloCard = document.createElement("div");
          yoloCard.className = "result-card";
          yoloCard.innerHTML = `
            <h3>Annotated Image (YOLO)</h3>
            <img src="${annotatedUrl}" alt="Annotated Image" style="max-width:100%;">
          `;
          resultsDiv.appendChild(yoloCard);
        } else {
          // YOLO results but no annotated image
          const yoloCard = document.createElement("div");
          yoloCard.className = "result-card";
          yoloCard.innerHTML = `<h3>YOLOv5 Predictions</h3><p>No annotated image returned.</p>`;
          results["YOLO"].forEach(pred => {
            yoloCard.innerHTML += `<p>${pred.label}: ${(pred.confidence * 100).toFixed(2)}%</p>`;
          });
          resultsDiv.appendChild(yoloCard);
        }
      }

      // Create cards for other models
      for (const [model, predictions] of Object.entries(results)) {
        if (model === "YOLO") continue; 
        const card = document.createElement("div");
        card.className = "result-card";
        card.innerHTML = `<h3>${model} Predictions</h3>`;
        
        const ul = document.createElement("ul");
        ul.className = "prediction-list";
        predictions.forEach(pred => {
          const li = document.createElement("li");
          li.innerHTML = `<span>${pred.label}</span><span>${(pred.confidence * 100).toFixed(2)}%</span>`;
          ul.appendChild(li);
        });
        card.appendChild(ul);
        resultsDiv.appendChild(card);
      }

      // If no results at all
      if (Object.keys(results).length === 0) {
        resultsDiv.innerHTML = "<div class='result-card'><p>No results found for the selected models.</p></div>";
      }

    } else {
      resultsDiv.innerHTML = "<div class='result-card'><p>Error processing the image. Please try again.</p></div>";
    }
  } catch (error) {
    console.error("Error:", error);
    resultsDiv.innerHTML = "<div class='result-card'><p>An error occurred. Check console for details.</p></div>";
  }
});
