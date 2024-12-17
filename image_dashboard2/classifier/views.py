from django.shortcuts import render
from django.http import JsonResponse
from ultralytics import YOLO
import torch
import torchvision.transforms as transforms
import torchvision.models as models
from PIL import Image

# Load Models
alexnet = models.alexnet(weights=models.AlexNet_Weights.IMAGENET1K_V1).eval()
googlenet = models.googlenet(weights=models.GoogLeNet_Weights.IMAGENET1K_V1).eval()
resnet = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V1).eval()
densenet = models.densenet121(weights=models.DenseNet121_Weights.IMAGENET1K_V1).eval()
yolo = YOLO("yolov5su.pt")

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])

with open("imagenet_classes.txt") as f:
    imagenet_labels = [line.strip() for line in f.readlines()]

def index(request):
    return render(request, "index.html")

def classify_image(request):
    if request.method == "POST" and request.FILES.get("image"):
        image_file = request.FILES["image"]
        image = Image.open(image_file).convert('RGB')

        input_tensor = transform(image).unsqueeze(0)
        selected_models = request.POST.getlist("models")
        results = {}

        def get_top5_outputs(model, input_t, model_name):
            outputs = model(input_t)
            probs = torch.nn.functional.softmax(outputs[0], dim=0)
            top_probs, top_indices = torch.topk(probs, 5)
            results[model_name] = [
                {"label": imagenet_labels[i.item()], "confidence": float(p)} 
                for p, i in zip(top_probs, top_indices)
            ]

        if "AlexNet" in selected_models:
            get_top5_outputs(alexnet, input_tensor, "AlexNet")

        if "GoogleNet" in selected_models:
            get_top5_outputs(googlenet, input_tensor, "GoogleNet")

        if "ResNet" in selected_models:
            get_top5_outputs(resnet, input_tensor, "ResNet")

        if "DenseNet" in selected_models:
            get_top5_outputs(densenet, input_tensor, "DenseNet")

        if "YOLO" in selected_models:
            detections = yolo(image)
            # YOLO detection handling
            results["YOLO"] = [
                {"label": yolo.names[int(box.cls[0].item())], "confidence": float(box.conf[0].item())}
                for box in detections[0].boxes
            ]

        return JsonResponse({"results": results})

    return JsonResponse({"error": "Invalid request"}, status=400)
