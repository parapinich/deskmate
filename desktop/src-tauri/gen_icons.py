from PIL import Image
import os

os.makedirs('icons', exist_ok=True)
Image.new('RGBA', (32, 32), (233, 69, 96, 255)).save('icons/32x32.png')
Image.new('RGBA', (128, 128), (233, 69, 96, 255)).save('icons/128x128.png')
Image.new('RGBA', (256, 256), (233, 69, 96, 255)).save('icons/128x128@2x.png')
Image.new('RGBA', (32, 32), (233, 69, 96, 255)).save('icons/icon.ico', format='ICO')
Image.new('RGBA', (128, 128), (233, 69, 96, 255)).save('icons/icon.icns', format='PNG')
print('Icons created!')
