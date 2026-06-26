import urllib.request
from PIL import Image
import os

url = 'https://www.gertvankeulen.nl/cms/wp-content/uploads/2021/06/cropped-favicon-192x192.png'
temp_path = 'temp_favicon.png'
output_path = 'transparent_favicon.png'

# Download the file
print("Downloading favicon...")
urllib.request.urlretrieve(url, temp_path)

# Open image
img = Image.open(temp_path).convert("RGBA")
datas = img.getdata()

new_data = []
for item in datas:
    # item is (r, g, b, a)
    # Check if the pixel is white (or very close to white) and make it transparent
    # Let's say if r > 240 and g > 240 and b > 240, make it transparent
    if item[0] > 240 and item[1] > 240 and item[2] > 240:
        new_data.append((255, 255, 255, 0))
    else:
        new_data.append(item)

img.putdata(new_data)
img.save(output_path, "PNG")
print("Saved transparent favicon.")
