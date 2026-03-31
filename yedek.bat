@echo off
cd "C:\Users\durma\OneDrive\Desktop\muhasebe-pro"
git add -A
git commit -m "otomatik yedek - %date% %time%"
git push
echo Yedek alindi! Pencereyi kapatabilirsiniz.
pause
