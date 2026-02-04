from pypdf import PdfReader                                           
r = PdfReader(r"C:/Users/renja/Downloads/chipotleNutrition.pdf")      
text = "".join((p.extract_text() or "") for p in r.pages)             
print("len:", len(text))                                              
print(text[:4000])                                                    
