import os
import io
import uuid
import math
import shutil
import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, HTTPException, Response, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
from PIL import Image, ImageDraw, ImageFont

# Initialize FastAPI App
app = FastAPI(title="GridifyPDF", description="Locally hosted PDF collage builder")

# Directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "temp_data")
UPLOADS_DIR = os.path.join(TEMP_DIR, "uploads")
THUMBNAILS_DIR = os.path.join(TEMP_DIR, "thumbnails")

for d in [TEMP_DIR, UPLOADS_DIR, THUMBNAILS_DIR]:
    os.makedirs(d, exist_ok=True)

# Helper function to clear temp files on startup
@app.on_event("startup")
def startup_event():
    # Clean temp_data directories to ensure we start fresh
    for d in [UPLOADS_DIR, THUMBNAILS_DIR]:
        for filename in os.listdir(d):
            file_path = os.path.join(d, filename)
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            except Exception as e:
                print(f"Failed to delete {file_path}. Reason: {e}")

# Models
class PageConfig(BaseModel):
    id: str
    doc_id: str
    doc_name: str
    doc_filename: str
    page_num: int
    rotation: int  # 0, 90, 180, 270
    label: str

class ExportOptions(BaseModel):
    columns: int = 3
    burn_labels: bool = True
    format: str = "pdf"  # "pdf" or "image"
    collage_title: str = "My Collage"

class ExportPayload(BaseModel):
    pages: List[PageConfig]
    options: ExportOptions

# Endpoints
@app.get("/")
def read_root():
    return RedirectResponse(url="/static/index.html")

@app.post("/api/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    uploaded_pages = []
    
    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            continue
            
        doc_id = str(uuid.uuid4())
        # Clean up filename to prevent directory traversal
        safe_filename = os.path.basename(file.filename)
        # Add uuid to prevent collisions
        dest_filename = f"{doc_id}_{safe_filename}"
        dest_path = os.path.join(UPLOADS_DIR, dest_filename)
        
        # Save uploaded file
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        try:
            # Open PDF with PyMuPDF
            doc = fitz.open(dest_path)
            
            for page_num in range(len(doc)):
                page_id = f"{doc_id}_{page_num}"
                page = doc.load_page(page_num)
                
                # Render 100 DPI thumbnail
                pix = page.get_pixmap(dpi=100)
                thumb_path = os.path.join(THUMBNAILS_DIR, f"{page_id}.png")
                pix.save(thumb_path)
                
                uploaded_pages.append({
                    "id": page_id,
                    "doc_id": doc_id,
                    "doc_filename": dest_filename,
                    "doc_name": safe_filename,
                    "page_num": page_num,
                    "thumbnail_url": f"/api/thumbnail/{page_id}"
                })
            doc.close()
        except Exception as e:
            # Clean up if failed
            if os.path.exists(dest_path):
                os.remove(dest_path)
            raise HTTPException(status_code=400, detail=f"Failed to process PDF {safe_filename}: {str(e)}")
            
    return {"pages": uploaded_pages}

@app.get("/api/thumbnail/{page_id}")
def get_thumbnail(page_id: str):
    path = os.path.join(THUMBNAILS_DIR, f"{page_id}.png")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(path, media_type="image/png")

@app.post("/api/export")
async def export_collage(payload: ExportPayload):
    if not payload.pages:
        raise HTTPException(status_code=400, detail="No pages specified for collage export")
        
    pages = payload.pages
    opts = payload.options
    
    # Open all unique source PDFs first to optimize performance
    open_docs = {}
    
    try:
        # Load source documents
        for p in pages:
            if p.doc_id not in open_docs:
                doc_path = os.path.join(UPLOADS_DIR, p.doc_filename)
                if not os.path.exists(doc_path):
                    # Try to locate by pattern if uuid prefix exists
                    found = False
                    for fname in os.listdir(UPLOADS_DIR):
                        if fname.startswith(p.doc_id):
                            doc_path = os.path.join(UPLOADS_DIR, fname)
                            found = True
                            break
                    if not found:
                        raise HTTPException(status_code=400, detail=f"Source PDF for document {p.doc_name} is missing")
                open_docs[p.doc_id] = fitz.open(doc_path)
                
        if opts.format.lower() == "pdf":
            # 1. Compile as a new PDF Document
            out_doc = fitz.open()
            
            for p in pages:
                src_doc = open_docs[p.doc_id]
                # Insert the specific page
                out_doc.insert_pdf(src_doc, from_page=p.page_num, to_page=p.page_num)
                new_page = out_doc[-1]
                
                # Apply rotation
                # PyMuPDF set_rotation takes 0, 90, 180, 270 degrees
                new_page.set_rotation(p.rotation)
                
                # Draw footer label if requested
                if opts.burn_labels and p.label.strip():
                    # The page dimensions might change depending on rotation
                    w = new_page.rect.width
                    h = new_page.rect.height
                    
                    # Create a white background box for readability at the bottom
                    margin = 15
                    box_h = 30
                    rect = fitz.Rect(margin, h - box_h - margin, w - margin, h - margin)
                    
                    # Draw a light border and white fill
                    new_page.draw_rect(rect, color=(0.8, 0.8, 0.8), fill=(1, 1, 1), width=1, overlay=True)
                    
                    # Insert text center-aligned (align=1 is center)
                    new_page.insert_textbox(
                        rect, 
                        p.label.strip(), 
                        fontname="helv", 
                        fontsize=10, 
                        color=(0, 0, 0), 
                        align=1
                    )
            
            pdf_bytes = out_doc.tobytes()
            out_doc.close()
            
            # Clean up open documents
            for doc in open_docs.values():
                doc.close()
                
            safe_title = "".join([c if c.isalnum() or c in " .-_" else "_" for c in opts.collage_title])
            filename = f"{safe_title}.pdf"
            
            return Response(
                content=pdf_bytes, 
                media_type="application/pdf", 
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
            
        elif opts.format.lower() == "image":
            # 2. Compile as a single visual grid image (Photo Collage style)
            page_images = []
            
            # Render each page at high quality (150 DPI) and apply rotation
            for p in pages:
                src_doc = open_docs[p.doc_id]
                page = src_doc.load_page(p.page_num)
                pix = page.get_pixmap(dpi=150)
                
                # Load to PIL Image
                img_bytes = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_bytes))
                
                # Apply rotation in PIL (Pillow rotates counter-clockwise, so -p.rotation rotates clockwise)
                if p.rotation != 0:
                    img = img.rotate(-p.rotation, expand=True)
                
                page_images.append((img, p.label.strip()))
            
            # Close PDF documents as we have converted everything to PIL
            for doc in open_docs.values():
                doc.close()
                
            # Set grid constants
            cols = max(1, opts.columns)
            rows = math.ceil(len(page_images) / cols)
            
            # Normalize cell sizes: We will scale all images to a target width of 600px
            # preserving aspect ratio.
            cell_w = 600
            scaled_pages = []
            max_h = 0
            
            for img, label in page_images:
                w, h = img.size
                scale = cell_w / w
                new_h = int(h * scale)
                resized_img = img.resize((cell_w, new_h), Image.Resampling.LANCZOS)
                scaled_pages.append((resized_img, label))
                if new_h > max_h:
                    max_h = new_h
            
            # Add vertical padding for the label
            label_space = 40 if opts.burn_labels else 0
            cell_h = max_h + label_space + 20  # image height + label + spacing
            
            # Grid spacing
            margin = 30
            spacing = 20
            
            canvas_w = (cols * cell_w) + ((cols - 1) * spacing) + (2 * margin)
            canvas_h = (rows * cell_h) + ((rows - 1) * spacing) + (2 * margin)
            
            # Create white canvas
            canvas = Image.new("RGB", (canvas_w, canvas_h), color=(249, 250, 251)) # Clean tailwind grey/white
            draw = ImageDraw.Draw(canvas)
            
            # Attempt to load a clean font, fall back to default if not available
            font = None
            if opts.burn_labels:
                font_paths = ["arial.ttf", "LiberationSans-Regular.ttf", "C:\\Windows\\Fonts\\arial.ttf"]
                for fp in font_paths:
                    try:
                        font = ImageFont.truetype(fp, 16)
                        break
                    except:
                        continue
                if font is None:
                    font = ImageFont.load_default()
            
            # Paste images and draw labels
            for idx, (img, label) in enumerate(scaled_pages):
                r = idx // cols
                c = idx % cols
                
                # Top-left coordinates for this cell
                x = margin + c * (cell_w + spacing)
                y = margin + r * (cell_h + spacing)
                
                # Center image horizontally in the cell if it's shorter than max_h
                img_w, img_h = img.size
                img_x = x
                img_y = y + (max_h - img_h) // 2
                
                # Draw a subtle drop shadow/border around each page image
                draw.rectangle(
                    [img_x - 2, img_y - 2, img_x + img_w + 2, img_y + img_h + 2], 
                    outline=(229, 231, 235), 
                    width=2
                )
                
                canvas.paste(img, (img_x, img_y))
                
                # Draw label
                if opts.burn_labels and label:
                    # Position label under the image area
                    label_y = y + max_h + 10
                    # Measure text using textlength or fallback
                    try:
                        text_w = draw.textlength(label, font=font)
                    except AttributeError:
                        # Fallback for older Pillow versions
                        text_w, _ = draw.textsize(label, font=font) if hasattr(draw, "textsize") else (100, 15)
                        
                    label_x = x + (cell_w - text_w) // 2
                    
                    # Draw a nice pill badge under the image
                    badge_padding_x = 12
                    badge_padding_y = 6
                    badge_rect = [
                        label_x - badge_padding_x, 
                        label_y - badge_padding_y, 
                        label_x + text_w + badge_padding_x, 
                        label_y + 16 + badge_padding_y
                    ]
                    draw.rounded_rectangle(badge_rect, radius=6, fill=(243, 244, 246), outline=(209, 213, 219), width=1)
                    draw.text((label_x, label_y), label, fill=(31, 41, 55), font=font)
                    
            img_byte_arr = io.BytesIO()
            canvas.save(img_byte_arr, format="PNG")
            img_bytes = img_byte_arr.getvalue()
            
            safe_title = "".join([c if c.isalnum() or c in " .-_" else "_" for c in opts.collage_title])
            filename = f"{safe_title}.png"
            
            return Response(
                content=img_bytes, 
                media_type="image/png", 
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
            
        else:
            raise HTTPException(status_code=400, detail="Invalid export format")
            
    except Exception as e:
        # Clean up open documents
        for doc in open_docs.values():
            try:
                doc.close()
            except:
                pass
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

# Mount static folder
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
