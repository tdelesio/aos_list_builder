import re

line_1 = "Alchemite Warforger 1 130 0-1 Sigmarite  War\xa0Machine,"
line_2 = "Black Ark Corsairs 10 120 Aelf, Infantry"
line_3 = "✹  Bloodwrack Shrine 1 270 (-10) 0-1 Coven Matriarch , Any non-Aelf 120 × 92mm"

# This is the regex from parse_profiles.py
regex = r'^([A-Z✹\s•\.\-\u2011\u00ad]+[a-z][A-Za-z\s\u2011\u00ad\’\-\,\&\’]+)\s+(\d+)\s+([0-9\-\+]+(?:\s*\([0-9\-\+]+\))?)\s*(.*)$'

print("Test line 1:", re.match(regex, line_1))
print("Test line 2:", re.match(regex, line_2))
print("Test line 3:", re.match(regex, line_3))

# Let's inspect what pypdf actually outputs for a few lines of page 4
from pypdf import PdfReader
pdf_path = "/Users/tim/Downloads/eng_08-07_warhammer_age_of_sigmar_core_rules_battle_profiles-9ntdrvyny0-focg47vjyb.pdf"
reader = PdfReader(pdf_path)
print("=== PAGE 4 RAW LINES ===")
for line in reader.pages[3].extract_text().split("\n")[:15]:
    print(repr(line))
