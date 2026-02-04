from pathlib import Path
path = Path(r"C:\Users\renja\Downloads\Potbelly-Menu-PDF.pdf")
text = ""
try:
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    print(text[:4000])
    print("\n---TEXT_LENGTH---\n", len(text))
except Exception as e:
    print("pdfplumber failed:", e)
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        print(text[:4000])
        print("\n---TEXT_LENGTH---\n", len(text))
    except Exception as e2:
        print("pypdf failed:", e2)
