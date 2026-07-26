import re
import json
from pypdf import PdfReader

pdf_path = "/Users/tim/Downloads/eng_08-07_warhammer_age_of_sigmar_core_rules_battle_profiles-9ntdrvyny0-focg47vjyb.pdf"
reader = PdfReader(pdf_path)

# Standard factions in Warhammer AoS
CORE_FACTIONS = [
    "CITIES OF SIGMAR", "DAUGHTERS OF KHAINE", "FYRESLAYERS", "IDONETH DEEPKIN",
    "KHARADRON OVERLORDS", "LUMINETH REALM-LORDS", "SERAPHON", "STORMCAST ETERNALS", "SYLVANETH",
    "BLADES OF KHORNE", "DISCIPLES OF TZEENTCH", "HEDONITES OF SLAANESH", "HELSMITHS OF HASHUT",
    "MAGGOTKIN OF NURGLE", "SKAVEN", "SLAVES TO DARKNESS", "FLESH-EATER COURTS", "NIGHTHAUNT",
    "OSSIARCH BONEREAPERS", "SOULBLIGHT GRAVELORDS", "GLOOMSPITE GITZ", "IRONJAWZ", "KRULEBOYZ",
    "OGOR MAWTRIBES", "SONS OF BEHEMAT"
]

def clean_faction_name(name):
    name = name.strip()
    if "Nurgle" in name or "NURGLE" in name:
        name = "MAGGOTKIN OF NURGLE"
    return name

def parse_pdf():
    database = {
        "factions": {},
        "regiments_of_renown": [],
        "manifestations": [],
        "legends": {}
    }

    current_faction = None
    current_section = None  # None, "LEGENDS", "RENOWN", "MANIFESTATION"
    current_type = None  # "HEROES", "UNITS", "AUXILIARY"
    active_entry = None
    pending_name = ""
    
    # Helper to save active entry
    def save_active_entry():
        nonlocal active_entry
        if not active_entry:
            return
        
        # Parse the rest_text to separate regiment options/keywords, notes, and base size
        text = " ".join(active_entry["raw_lines"]).strip()
        
        # 1. Extract base size from the end of the text
        base_size_match = re.search(r'(?:(\d+(?:\s*×\s*\d+)?\s*mm(?:\s*\[\d+\])?)(?:,\s*\d+(?:\s*×\s*\d+)?\s*mm(?:\s*\[\d+\])?)*\s*(?:\s*or\s*(?:\d+(?:\s*×\s*\d+)?\s*mm(?:\s*\[\d+\])?)(?:,\s*\d+(?:\s*×\s*\d+)?\s*mm(?:\s*\[\d+\])?)*)*)$', text, re.IGNORECASE)
        base_size = "Unknown"
        if base_size_match:
            base_size = base_size_match.group(0).strip()
            text = text[:base_size_match.start()].strip()
            
        active_entry["base_size"] = base_size
        
        # 2. Distinguish between regiment_options/relevant_keywords and notes
        notes_start = -1
        notes_markers = [
            "This unit", "This Hero", "You can include", "You cannot", "Must be", "Previously",
            "This Regiment", "Can join", "Only taken in", "This unit cannot be reinforced"
        ]
        for marker in notes_markers:
            idx = text.find(marker)
            if idx != -1 and (notes_start == -1 or idx < notes_start):
                notes_start = idx
                
        if notes_start != -1:
            active_entry["options_or_keywords"] = text[:notes_start].strip()
            active_entry["notes"] = text[notes_start:].strip()
        else:
            active_entry["options_or_keywords"] = text
            active_entry["notes"] = ""
            
        active_entry["options_or_keywords"] = re.sub(r',\s*$', '', active_entry["options_or_keywords"]).strip()
        
        # Save to database
        if current_section == "RENOWN":
            database["regiments_of_renown"].append(active_entry)
        elif current_section == "MANIFESTATION":
            database["manifestations"].append(active_entry)
        elif current_section == "LEGENDS":
            legend_faction = current_faction or "OTHER"
            if legend_faction not in database["legends"]:
                database["legends"][legend_faction] = {"heroes": [], "units": []}
            if current_type == "HEROES":
                database["legends"][legend_faction]["heroes"].append(active_entry)
            else:
                database["legends"][legend_faction]["units"].append(active_entry)
        else:
            if current_faction:
                if current_faction not in database["factions"]:
                    database["factions"][current_faction] = {"heroes": [], "units": [], "auxiliary": []}
                
                if current_type == "HEROES":
                    database["factions"][current_faction]["heroes"].append(active_entry)
                elif current_type == "UNITS":
                    database["factions"][current_faction]["units"].append(active_entry)
                else:
                    database["factions"][current_faction]["auxiliary"].append(active_entry)
                    
        active_entry = None

    # Use a highly robust row-start matching regex that works with lowercase starting names as well
    entry_regex = r'^([a-zA-Z✹\s•\.\-\u2011\u00ad\’\’\,\&\’\:\/\(\)]+)\s+(\d+)\s+([0-9\-\+]+(?:\s*\([0-9\-\+]+\))?)\s*(.*)$'

    for page_num in range(2, len(reader.pages)):  # Page index 2 is page 3 of the PDF
        text = reader.pages[page_num].extract_text()
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        
        num_lines = len(lines)
        i = 0
        while i < num_lines:
            line = lines[i]
            if line == "®" or line == "BATTLE PROFILES" or "JUNE 2026" in line:
                i += 1
                continue
            
            line_upper = line.upper()
            
            # Detect section transitions
            is_legends_header = "WARHAMMER LEGENDS" in line_upper and "MOVE TO" not in line_upper and "ON" not in line_upper
            is_renown_header = "REGIMENTS OF RENOWN" in line_upper and "CAN BE INCLUDED" not in line_upper and "THIS REGIMENT" not in line_upper
            is_manifestation_header = "UNIVERSAL MANIFESTATION LORES" in line_upper
            
            if is_legends_header and len(line_upper) < 40:
                save_active_entry()
                current_section = "LEGENDS"
                current_faction = None
                current_type = None
                pending_name = ""
                i += 1
                continue
            elif is_renown_header and len(line_upper) < 40:
                save_active_entry()
                current_section = "RENOWN"
                current_faction = None
                current_type = "UNITS"
                pending_name = ""
                i += 1
                continue
            elif is_manifestation_header and len(line_upper) < 45:
                save_active_entry()
                current_section = "MANIFESTATION"
                current_faction = None
                current_type = "AUXILIARY"
                pending_name = ""
                i += 1
                continue
                
            # Check for Factions (using space-independent matching)
            faction_detected = False
            line_stripped = line_upper.replace(" ", "")
            for faction in CORE_FACTIONS:
                faction_stripped = faction.replace(" ", "")
                if faction_stripped in line_stripped and (line_stripped.startswith(faction_stripped) or "NEW" in line_stripped or "UPDATED" in line_stripped):
                    save_active_entry()
                    current_faction = clean_faction_name(faction)
                    current_section = None  # Reset section for standard factions!
                    faction_detected = True
                    pending_name = ""
                    break
            
            if faction_detected:
                if current_faction not in database["factions"]:
                    database["factions"][current_faction] = {"heroes": [], "units": [], "auxiliary": []}
                i += 1
                continue
                
            # Detect table headers
            if "HEROES UNIT SIZE" in line_upper or "LEGENDS HEROES" in line_upper:
                save_active_entry()
                current_type = "HEROES"
                pending_name = ""
                i += 1
                continue
            elif "UNITS UNIT SIZE" in line_upper or "LEGENDS UNITS" in line_upper or "R ELEVA NT K EY WOR DS" in line_upper or "RELEVANT KEYWORDS" in line_upper:
                save_active_entry()
                current_type = "UNITS"
                pending_name = ""
                i += 1
                continue
            elif "TYPE NAME POINTS" in line_upper:
                save_active_entry()
                current_type = "AUXILIARY"
                pending_name = ""
                i += 1
                continue
                
            # Try to match a standard table row
            match = re.match(entry_regex, line)
            
            # --- Lookahead Pending Name Logic ---
            # If current line is NOT a row match, but we are in HEROES or UNITS mode,
            # we check if the NEXT line is a row match and current line is a name fragment.
            if not match and current_type in ["HEROES", "UNITS"]:
                is_next_row_match = False
                if i + 1 < num_lines:
                    next_line = lines[i+1]
                    next_line_upper = next_line.upper()
                    # Make sure the next line is not a header or transition itself
                    is_special_header = any(f.replace(" ", "") in next_line_upper.replace(" ", "") for f in CORE_FACTIONS) or \
                                        "HEROES UNIT SIZE" in next_line_upper or "UNITS UNIT SIZE" in next_line_upper or \
                                        "R ELEVA NT" in next_line_upper or "WARHAMMER LEGENDS" in next_line_upper or \
                                        "REGIMENTS" in next_line_upper
                    if not is_special_header:
                        next_match = re.match(entry_regex, next_line)
                        if next_match:
                            is_next_row_match = True
                            
                is_name_fragment = re.match(r'^[A-Za-z\s\u2011\u00ad\’\-\,\&\’]+$', line) and 'mm' not in line and len(line) < 45
                
                if is_next_row_match and is_name_fragment:
                    save_active_entry()  # Commit previous hero before taking name fragment
                    pending_name = line
                    i += 1
                    continue
                    
            if match and current_type in ["HEROES", "UNITS"]:
                save_active_entry()
                name = match.group(1).strip()
                name = re.sub(r'^[✹•\s]+', '', name).strip()
                
                # Prepend pending name fragment if we have one
                if pending_name:
                    name = pending_name + " " + name
                    pending_name = ""
                    
                unit_size = int(match.group(2))
                
                points_raw = match.group(3).strip()
                points_num_match = re.match(r'^(\d+)', points_raw)
                points = int(points_num_match.group(1)) if points_num_match else 0
                
                rest = match.group(4).strip()
                active_entry = {
                    "name": name,
                    "unit_size": unit_size,
                    "points": points,
                    "points_raw": points_raw,
                    "raw_lines": [rest] if rest else []
                }
            elif active_entry:
                active_entry["raw_lines"].append(line)
            else:
                # If we are parsing auxiliary rules
                if current_type == "AUXILIARY" and current_faction:
                    aux_match = re.match(r'^(.*?)\s+(\d+)\s+(.*)$', line)
                    if aux_match:
                        name_and_type = aux_match.group(1).strip()
                        points = int(aux_match.group(2))
                        notes = aux_match.group(3).strip()
                        if current_faction not in database["factions"]:
                            database["factions"][current_faction] = {"heroes": [], "units": [], "auxiliary": []}
                        database["factions"][current_faction]["auxiliary"].append({
                            "name": name_and_type,
                            "points": points,
                            "notes": notes
                        })
            i += 1

    # Save final outstanding entry
    save_active_entry()
    
    return database

if __name__ == "__main__":
    print("Parsing PDF, please wait...")
    db = parse_pdf()
    
    # Save to file
    with open("battle_profiles.json", "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)
        
    print("Parsing completed successfully!")
    print(f"Total Factions parsed: {len(db['factions'])}")
    for f, data in sorted(db['factions'].items()):
        print(f" - {f}: {len(data['heroes'])} Heroes, {len(data['units'])} Units, {len(data['auxiliary'])} Aux rules")
    print(f"Total Regiments of Renown: {len(db['regiments_of_renown'])}")
    print(f"Total Manifestation Lores: {len(db['manifestations'])}")
    print(f"Total Legend Factions: {len(db['legends'])}")
