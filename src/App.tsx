import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Presentation, 
  ArrowRight, 
  CheckCircle2, 
  Loader2, 
  Download,
  Sparkles,
  ShieldCheck,
  Zap,
  Upload,
  AlertCircle,
  Image as ImageIcon,
  Building2,
  Briefcase,
  Plus,
  X,
  History,
  Layout,
  Type as TypeIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronLeft,
  ChevronRight,
  Trash2,
  MessageSquare,
  Maximize2,
  Minimize2,
  Save,
  RotateCcw,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import PptxGenJS from 'pptxgenjs';
import { GoogleGenAI, Type } from "@google/genai";
import { GoogleIntegration } from './components/GoogleIntegration';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

interface Slide {
  title: string;
  content: string[];
  speakerNotes: string;
  layout: 'TITLE' | 'SPLIT' | 'CONTENT' | 'HERO';
  imageKeyword?: string;
  visualConfig?: {
    textAlignment?: 'left' | 'center' | 'right';
    imagePosition?: 'left' | 'right' | 'top' | 'bottom';
    titleSize?: number;
    contentSize?: number;
    isStyleReference?: boolean;
  };
}

interface DeckHistory {
  id: string;
  timestamp: number;
  slides: Slide[];
  fileName: string;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [agencyLogo, setAgencyLogo] = useState<string | null>(null);
  const [brandLogo, setBrandLogo] = useState<string | null>(null);
  const [mediaFiles, setMediaFiles] = useState<{file: File, preview: string}[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReworking, setIsReworking] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [history, setHistory] = useState<DeckHistory[]>([]);
  const [globalPrompt, setGlobalPrompt] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const agencyLogoInputRef = useRef<HTMLInputElement>(null);
  const brandLogoInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== 'application/pdf') {
        setError('Please upload a PDF file');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setSuccess(false);
      setStatus('');
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'agency' | 'brand') => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (type === 'agency') setAgencyLogo(event.target?.result as string);
        else setBrandLogo(event.target?.result as string);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map((file: File) => ({
        file,
        preview: URL.createObjectURL(file)
      }));
      setMediaFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => item.str);
      fullText += strings.join(' ') + '\n';
    }
    
    return fullText;
  };

  const generateAISlides = async (text: string): Promise<Slide[]> => {
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API Key is missing. Please add GEMINI_API_KEY to your Secrets.');
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    const styleReferences = slides.filter(s => s.visualConfig?.isStyleReference);
    const styleContext = styleReferences.length > 0 
      ? `USER FEEDBACK: The user liked the following slides. Emulate their tone, depth, and layout style in the new slides: ${JSON.stringify(styleReferences)}`
      : '';

    const systemInstruction = `You are a Senior Strategy Consultant at a top-tier creative agency. 
    Your task is to analyze a raw strategy document (PDF text) and transform it into an EXHAUSTIVE, strategic pitch deck.
    
    CRITICAL: DO NOT MISS KEY INFORMATION. Analyze every section of the document.
    
    ${styleContext}
    
    CRITICAL STRATEGIC ELEMENTS TO INCLUDE:
    1. CAMPAIGN CONCEPT: Define the core idea (e.g., "Become a Pro Barista").
    2. OFFLINE ACTIVATION: Detail the "Masterclass Experience" (cities, frequency, structure).
    3. UPSELL MOMENT: Explain how to convert participants into customers (e.g., "Home Barista Kit Offer").
    4. ONLINE ACTIVATION LAYER: Digital learning ecosystem, video series, social media challenges (#BrewLikeABarista).
    5. INFLUENCER STRATEGY: Creator seeding, private masterclass nights.
    6. COMMUNITY BUILDING: Home Barista Club, WhatsApp/Discord communities.
    7. CONTENT FLYWHEEL: How one event generates weeks of content.
    8. EXPECTED IMPACT: Business and marketing benefits for both brands.
    9. PR HOOK: The "India's First Café-to-Home Coffee Collaboration" story angle.
    
    OUTPUT FORMAT: Return a JSON array of 15-20 Slide objects.
    Slide interface: { title: string, content: string[], speakerNotes: string, layout: 'TITLE' | 'SPLIT' | 'CONTENT' | 'HERO', imageKeyword: string, visualConfig: { textAlignment: 'left' | 'center' | 'right', imagePosition: 'left' | 'right' } }`;

    const prompt = `ACT AS A SENIOR STRATEGIST. READ THE FOLLOWING TEXT CAREFULLY. 
    EXTRACT EVERY STRATEGIC MOVE, PARTNERSHIP DETAIL, AND EXECUTION STEP.
    
    YOUR GOAL: Create a deck that is as deep and professional as a McKinsey or BCG presentation.
    - If there are specific cities mentioned, include them.
    - If there are specific phases or timelines, include them.
    - If there are specific product bundles or offers, include them.
    - DO NOT HALLUCINATE, but DO EXPAND on the strategic "WHY" behind the moves.
    
    Strategy Text:
    ${text}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              content: { type: Type.ARRAY, items: { type: Type.STRING } },
              speakerNotes: { type: Type.STRING },
              layout: { type: Type.STRING, enum: ['TITLE', 'SPLIT', 'CONTENT', 'HERO'] },
              imageKeyword: { type: Type.STRING }
            },
            required: ['title', 'content', 'speakerNotes', 'layout', 'imageKeyword']
          }
        }
      }
    });

    try {
      return JSON.parse(response.text || '[]');
    } catch (e) {
      console.error("Failed to parse AI response", e);
      throw new Error("The AI generated an invalid response format. Please try again.");
    }
  };

  const reworkSlide = async (index: number, prompt: string) => {
    if (!GEMINI_API_KEY) return;
    setIsReworking(true);
    setStatus(`Reworking slide ${index + 1}...`);
    
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const slide = slides[index];
    
    const styleReferences = slides.filter(s => s.visualConfig?.isStyleReference);
    const styleContext = styleReferences.length > 0 
      ? `USER FEEDBACK: The user liked these slides. Maintain this style: ${JSON.stringify(styleReferences)}`
      : '';

    const systemInstruction = `You are a Senior Strategy Consultant. Rework the following slide based on the user's request. 
    Maintain the premium, strategic tone.
    ${styleContext}
    Slide interface: { title: string, content: string[], speakerNotes: string, layout: 'TITLE' | 'SPLIT' | 'CONTENT' | 'HERO', imageKeyword: string, visualConfig: { textAlignment: 'left' | 'center' | 'right', imagePosition: 'left' | 'right' } }`;

    const fullPrompt = `User Request: ${prompt}
    Current Slide: ${JSON.stringify(slide)}`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: fullPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              content: { type: Type.ARRAY, items: { type: Type.STRING } },
              speakerNotes: { type: Type.STRING },
              layout: { type: Type.STRING, enum: ['TITLE', 'SPLIT', 'CONTENT', 'HERO'] },
              imageKeyword: { type: Type.STRING },
              visualConfig: {
                type: Type.OBJECT,
                properties: {
                  textAlignment: { type: Type.STRING, enum: ['left', 'center', 'right'] },
                  imagePosition: { type: Type.STRING, enum: ['left', 'right'] }
                }
              }
            },
            required: ['title', 'content', 'speakerNotes', 'layout', 'imageKeyword']
          }
        }
      });

      const reworkedSlide = JSON.parse(response.text || '{}');
      const updatedSlides = [...slides];
      updatedSlides[index] = reworkedSlide;
      setSlides(updatedSlides);
      setStatus('Slide reworked successfully.');
    } catch (err) {
      console.error("Rework failed", err);
      setError("Failed to rework slide. Please try again.");
    } finally {
      setIsReworking(false);
    }
  };

  const reworkWholePPT = async (prompt: string) => {
    if (!GEMINI_API_KEY || !prompt) return;
    setIsReworking(true);
    setStatus('Reworking entire presentation...');
    
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    const styleReferences = slides.filter(s => s.visualConfig?.isStyleReference);
    const styleContext = styleReferences.length > 0 
      ? `USER FEEDBACK: The user liked these slides. Maintain this style: ${JSON.stringify(styleReferences)}`
      : '';

    const systemInstruction = `You are a Senior Strategy Consultant. Rework the entire presentation based on the user's request. 
    Maintain the premium, strategic tone and narrative flow.
    ${styleContext}
    Slide interface: { title: string, content: string[], speakerNotes: string, layout: 'TITLE' | 'SPLIT' | 'CONTENT' | 'HERO', imageKeyword: string, visualConfig: { textAlignment: 'left' | 'center' | 'right', imagePosition: 'left' | 'right' } }`;

    const fullPrompt = `User Request: ${prompt}
    Current Slides: ${JSON.stringify(slides)}`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: fullPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.ARRAY, items: { type: Type.STRING } },
                speakerNotes: { type: Type.STRING },
                layout: { type: Type.STRING, enum: ['TITLE', 'SPLIT', 'CONTENT', 'HERO'] },
                imageKeyword: { type: Type.STRING },
                visualConfig: {
                  type: Type.OBJECT,
                  properties: {
                    textAlignment: { type: Type.STRING, enum: ['left', 'center', 'right'] },
                    imagePosition: { type: Type.STRING, enum: ['left', 'right'] }
                  }
                }
              },
              required: ['title', 'content', 'speakerNotes', 'layout', 'imageKeyword']
            }
          }
        }
      });

      const reworkedSlides = JSON.parse(response.text || '[]');
      setSlides(reworkedSlides);
      setStatus('Presentation reworked successfully.');
      setGlobalPrompt('');
    } catch (err) {
      console.error("Global rework failed", err);
      setError("Failed to rework presentation. Please try again.");
    } finally {
      setIsReworking(false);
    }
  };

  const handleGenerateFromText = async (text: string) => {
    setIsGenerating(true);
    setError(null);
    setSuccess(false);

    try {
      if (!text.trim()) {
        throw new Error('Source document appears empty or unreadable.');
      }

      setStatus('Analyzing strategy with AI...');
      const slideData = await generateAISlides(text);
      setSlides(slideData);
      saveToHistory();
      setShowEditor(true);
      setStatus('Strategy analysis complete.');
    } catch (err: any) {
      console.error('Generation Error:', err);
      setError(err.message || 'An unexpected error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please upload a source PDF');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSuccess(false);

    try {
      setStatus('Extracting intelligence from PDF...');
      const docText = await extractTextFromPDF(file);
      
      if (!docText.trim()) {
        throw new Error('Source document appears empty or unreadable.');
      }

      setStatus('Analyzing strategy with AI...');
      const slideData = await generateAISlides(docText);
      setSlides(slideData);
      saveToHistory();
      setShowEditor(true);
      setStatus('Strategy analysis complete.');
    } catch (err: any) {
      console.error('Generation Error:', err);
      setError(err.message || 'An unexpected error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = async () => {
    setIsGenerating(true);
    setError(null);
    setSuccess(false);

    try {
      setStatus('Composing visual elements...');
      
      let pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';
      
      // Define Master Slide for Brand Identity
      pptx.defineSlideMaster({
        title: 'PREMIUM_MASTER',
        background: { color: 'FDFDFB' }, // Warm off-white
        objects: [
          // Agency Logo (Bottom Left)
          ...(agencyLogo ? [{ image: { x: 0.4, y: 5.1, w: 0.8, h: 0.4, data: agencyLogo } }] : []),
          // Brand Logo (Bottom Right)
          ...(brandLogo ? [{ image: { x: 8.8, y: 5.1, w: 0.8, h: 0.4, data: brandLogo } }] : []),
          // Subtle Divider
          { line: { x: 0.4, y: 5.0, w: 9.2, line: { color: 'E5E5E1', width: 0.5 } } }
        ]
      });

      slides.forEach((slide, idx) => {
        const pptSlide = pptx.addSlide({ masterName: 'PREMIUM_MASTER' }) as any;
        
        const keyword = slide.imageKeyword || 'business';
        const placeholderImg = `https://picsum.photos/seed/${encodeURIComponent(keyword)}${idx}/1200/800`;

        // Use user-uploaded media if available, otherwise use relevant placeholder
        const mediaItem = mediaFiles[idx % mediaFiles.length];
        const slideImage = mediaItem?.preview || placeholderImg;
        const isVideo = mediaItem?.file.type.startsWith('video/');

        const config = slide.visualConfig || {};
        const textAlign = config.textAlignment || 'left';
        const titleSize = config.titleSize || 64;

        if (slide.layout === 'TITLE') {
          pptSlide.addText(slide.title, {
            x: 0.5, y: 1.5, w: '60%', h: 2,
            fontSize: titleSize, fontFace: 'Georgia', italic: true, bold: false,
            color: '1A1A1A', valign: 'middle', margin: 0,
            align: textAlign as any
          });
          pptSlide.addText('STRATEGIC PROPOSAL', {
            x: 0.5, y: 1.2, w: 3, h: 0.3,
            fontSize: 10, charSpacing: 2, color: '888888', bold: true,
            align: textAlign as any
          });
          if (isVideo) {
            pptSlide.addMedia({ type: 'video', path: slideImage, x: 6.5, y: 0, w: 3.5, h: 5.625 });
          } else if (slideImage) {
            pptSlide.addImage({ path: slideImage, x: 6.5, y: 0, w: 3.5, h: 5.625 });
          }
        } else if (slide.layout === 'SPLIT') {
          const isImageRight = config.imagePosition !== 'left';
          pptSlide.addText(slide.title, {
            x: isImageRight ? 0.5 : 5.5, y: 0.5, w: 4, h: 1,
            fontSize: config.titleSize || 42, fontFace: 'Georgia', color: '1A1A1A',
            align: textAlign as any
          });
          pptSlide.addText(slide.content.join('\n\n'), {
            x: isImageRight ? 0.5 : 5.5, y: 1.8, w: 4, h: 3,
            fontSize: 14, color: '444444', lineSpacing: 24,
            align: textAlign as any
          });
          if (isVideo) {
            pptSlide.addMedia({ type: 'video', path: slideImage, x: isImageRight ? 5 : 0.5, y: 0.5, w: 4.5, h: 4.2 });
          } else if (slideImage) {
            pptSlide.addImage({ path: slideImage, x: isImageRight ? 5 : 0.5, y: 0.5, w: 4.5, h: 4.2 });
          }
        } else if (slide.layout === 'HERO') {
          if (isVideo) {
            pptSlide.addMedia({ type: 'video', path: slideImage, x: 0, y: 0, w: 10, h: 5.625 });
          } else if (slideImage) {
            pptSlide.addImage({ path: slideImage, x: 0, y: 0, w: 10, h: 5.625 });
            // Dark overlay for text readability
            pptSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: '000000', transparency: 60 } });
          }
          pptSlide.addText(slide.title, {
            x: 1, y: 1.5, w: 8, h: 1,
            fontSize: config.titleSize || 54, fontFace: 'Georgia', color: 'FFFFFF', align: 'center'
          });
          pptSlide.addText(slide.content[0], {
            x: 1, y: 2.8, w: 8, h: 1,
            fontSize: 18, color: 'CCCCCC', align: 'center'
          });
        } else {
          pptSlide.addText(slide.title, {
            x: 0.5, y: 0.5, w: 9, h: 0.8,
            fontSize: config.titleSize || 36, fontFace: 'Georgia', color: '1A1A1A',
            align: textAlign as any
          });
          pptSlide.addText(slide.content.map(p => `• ${p}`).join('\n\n'), {
            x: 0.5, y: 1.5, w: 9, h: 3,
            fontSize: 16, color: '444444', lineSpacing: 28,
            align: textAlign as any
          });
        }

        pptSlide.addNotes(slide.speakerNotes);
      });

      setStatus('Finalizing premium export...');
      await pptx.writeFile({ fileName: `PitchPerfect_${Date.now()}.pptx` });
      
      setSuccess(true);
      setStatus('Deck exported successfully.');
    } catch (err: any) {
      console.error('Export Error:', err);
      setError(err.message || 'An unexpected error occurred during export.');
    } finally {
      setIsGenerating(false);
    }
  };

  const addSlide = () => {
    const newSlide: Slide = {
      title: 'New Strategic Slide',
      content: ['Strategic point one', 'Strategic point two'],
      speakerNotes: 'Notes for the new slide.',
      layout: 'CONTENT',
      imageKeyword: 'business'
    };
    setSlides([...slides, newSlide]);
  };

  const removeSlide = (index: number) => {
    setSlides(slides.filter((_, i) => i !== index));
  };

  const updateSlide = (index: number, updates: Partial<Slide>) => {
    const updatedSlides = [...slides];
    updatedSlides[index] = { ...updatedSlides[index], ...updates };
    setSlides(updatedSlides);
  };

  const saveToHistory = () => {
    if (slides.length === 0) return;
    const newEntry: DeckHistory = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      slides: [...slides],
      fileName: file?.name || 'Untitled Deck'
    };
    setHistory(prev => [newEntry, ...prev].slice(0, 10)); // Keep last 10
  };

  const restoreHistory = (entry: DeckHistory) => {
    setSlides(entry.slides);
    setShowEditor(true);
    setShowHistory(false);
  };

  const SlidePreview = ({ slide, index }: { slide: Slide, index: number }) => {
    const keyword = slide.imageKeyword || 'business';
    const placeholderImg = `https://picsum.photos/seed/${encodeURIComponent(keyword)}${index}/1200/800`;
    const mediaItem = mediaFiles[index % mediaFiles.length];
    const slideImage = mediaItem?.preview || placeholderImg;
    
    const config = slide.visualConfig || {};
    const textAlign = config.textAlignment || 'left';
    const titleSize = config.titleSize || (slide.layout === 'TITLE' ? 48 : 32);
    const contentSize = config.contentSize || 16;

    const renderLayout = () => {
      switch (slide.layout) {
        case 'TITLE':
          return (
            <div className="relative w-full h-full flex items-center bg-[#FDFDFB] overflow-hidden">
              <div className={`w-1/2 p-12 z-10 text-${textAlign}`}>
                <p className="text-[10px] font-bold tracking-[0.3em] text-[#888888] mb-4 uppercase">Strategic Proposal</p>
                <h2 style={{ fontSize: `${titleSize}px` }} className="font-serif italic leading-tight mb-6">{slide.title}</h2>
              </div>
              <div className="absolute right-0 top-0 w-[40%] h-full">
                <img src={slideImage} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
            </div>
          );
        case 'SPLIT':
          const isImageRight = config.imagePosition !== 'left';
          return (
            <div className={`flex w-full h-full bg-[#FDFDFB] ${isImageRight ? 'flex-row' : 'flex-row-reverse'}`}>
              <div className={`w-1/2 p-12 flex flex-col justify-center text-${textAlign}`}>
                <h2 style={{ fontSize: `${titleSize}px` }} className="font-serif italic mb-8">{slide.title}</h2>
                <div style={{ fontSize: `${contentSize}px` }} className="space-y-4 text-[#444444] leading-relaxed">
                  {slide.content.map((p, i) => <p key={i}>{p}</p>)}
                </div>
              </div>
              <div className="w-1/2 h-full p-8">
                <img src={slideImage} className="w-full h-full object-cover rounded-2xl" referrerPolicy="no-referrer" />
              </div>
            </div>
          );
        case 'HERO':
          return (
            <div className="relative w-full h-full bg-black flex items-center justify-center text-center p-20">
              <img src={slideImage} className="absolute inset-0 w-full h-full object-cover opacity-40" referrerPolicy="no-referrer" />
              <div className="relative z-10 max-w-3xl">
                <h2 style={{ fontSize: `${titleSize}px` }} className="font-serif italic text-white mb-6">{slide.title}</h2>
                <p style={{ fontSize: `${contentSize}px` }} className="text-white/80 leading-relaxed">{slide.content[0]}</p>
              </div>
            </div>
          );
        default: // CONTENT
          return (
            <div className={`w-full h-full p-16 bg-[#FDFDFB] text-${textAlign}`}>
              <h2 style={{ fontSize: `${titleSize}px` }} className="font-serif italic mb-12 border-b border-[#E5E5E1] pb-6">{slide.title}</h2>
              <ul style={{ fontSize: `${contentSize}px` }} className="space-y-6 text-[#444444]">
                {slide.content.map((p, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1A1A1A] mt-2 shrink-0" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
      }
    };

    return (
      <div className="aspect-video w-full bg-white shadow-2xl rounded-lg overflow-hidden border border-[#E5E5E1]">
        {renderLayout()}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#FDFDFB] text-[#1A1A1A] font-sans selection:bg-[#1A1A1A] selection:text-white">
      {/* Premium Header */}
      <nav className="border-b border-[#E5E5E1] px-8 py-6 flex justify-between items-center bg-white/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#1A1A1A] rounded-full flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-serif italic text-2xl tracking-tight">PitchPerfect AI</span>
        </div>
        
        <div className="hidden md:flex items-center gap-8 text-[11px] font-bold uppercase tracking-[0.2em] text-[#888888]">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 hover:text-[#1A1A1A] transition-colors"
          >
            <History className="w-4 h-4" />
            History
          </button>
          <span className="flex items-center gap-2 text-[#1A1A1A]">
            <ShieldCheck className="w-4 h-4" />
            End-to-End Encryption
          </span>
        </div>
      </nav>

      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed right-0 top-0 h-full w-80 bg-white border-l border-[#E5E5E1] z-[60] shadow-2xl p-8 overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-8">
              <h3 className="font-serif italic text-2xl">History</h3>
              <button onClick={() => setShowHistory(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              {history.length === 0 && <p className="text-xs text-[#888888]">No history yet.</p>}
              {history.map(entry => (
                <button 
                  key={entry.id}
                  onClick={() => restoreHistory(entry)}
                  className="w-full text-left p-4 rounded-2xl border border-[#E5E5E1] hover:border-[#1A1A1A] transition-all group"
                >
                  <p className="text-xs font-bold truncate mb-1">{entry.fileName}</p>
                  <p className="text-[10px] text-[#888888]">{new Date(entry.timestamp).toLocaleString()}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-[1400px] mx-auto px-8 py-16 lg:py-24">
        <AnimatePresence mode="wait">
          {!showEditor ? (
            <motion.div 
              key="uploader"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid lg:grid-cols-[1fr_450px] gap-24 items-start"
            >
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <span className="h-[1px] w-12 bg-[#1A1A1A]"></span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#888888]">The Future of Strategy</span>
                </div>
                <h1 className="text-[120px] font-serif italic leading-[0.85] tracking-[-0.04em] mb-12">
                  Premium <br />
                  <span className="text-[#888888]">Intelligence.</span>
                </h1>
                
                <p className="text-2xl font-light text-[#444444] mb-16 max-w-xl leading-relaxed">
                  Transform raw PDF strategy into editorial-grade pitch decks. 
                  Designed for CMOs who demand visual excellence and strategic depth.
                </p>
                
                <div className="grid grid-cols-2 gap-12 mb-20">
                  {[
                    { title: "Editorial Design", desc: "Minimal, high-contrast layouts inspired by premium magazines." },
                    { title: "Brand Identity", desc: "Seamlessly integrate agency and client logos into every slide." },
                    { title: "Asset Control", desc: "Upload your own high-res media to anchor the narrative." },
                    { title: "Context Aware", desc: "AI selects visual themes relevant to your specific industry." }
                  ].map((item, i) => (
                    <div key={i} className="space-y-3">
                      <h4 className="text-sm font-bold uppercase tracking-widest">{item.title}</h4>
                      <p className="text-sm text-[#888888] leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>

                <div className="p-10 rounded-[40px] border border-[#E5E5E1] bg-white shadow-2xl shadow-black/5">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-full bg-[#F5F5F0] flex items-center justify-center">
                      <Briefcase className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-serif italic">Identity & Assets</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-8 mb-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Agency Logo</label>
                      <button 
                        onClick={() => agencyLogoInputRef.current?.click()}
                        className="w-full aspect-video rounded-2xl border border-dashed border-[#E5E5E1] hover:border-[#1A1A1A] transition-all flex flex-col items-center justify-center gap-2 bg-[#FDFDFB] overflow-hidden group"
                      >
                        {agencyLogo ? (
                          <img src={agencyLogo} alt="Agency" className="w-full h-full object-contain p-4" />
                        ) : (
                          <>
                            <Building2 className="w-5 h-5 text-[#888888] group-hover:text-[#1A1A1A]" />
                            <span className="text-[10px] font-bold">Upload</span>
                          </>
                        )}
                      </button>
                      <input type="file" ref={agencyLogoInputRef} className="hidden" accept="image/*" onChange={(e) => handleLogoUpload(e, 'agency')} />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Brand Logo</label>
                      <button 
                        onClick={() => brandLogoInputRef.current?.click()}
                        className="w-full aspect-video rounded-2xl border border-dashed border-[#E5E5E1] hover:border-[#1A1A1A] transition-all flex flex-col items-center justify-center gap-2 bg-[#FDFDFB] overflow-hidden group"
                      >
                        {brandLogo ? (
                          <img src={brandLogo} alt="Brand" className="w-full h-full object-contain p-4" />
                        ) : (
                          <>
                            <Briefcase className="w-5 h-5 text-[#888888] group-hover:text-[#1A1A1A]" />
                            <span className="text-[10px] font-bold">Upload</span>
                          </>
                        )}
                      </button>
                      <input type="file" ref={brandLogoInputRef} className="hidden" accept="image/*" onChange={(e) => handleLogoUpload(e, 'brand')} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Campaign Media (Images/Video)</label>
                    <div className="flex flex-wrap gap-3">
                      {mediaFiles.map((m, i) => (
                        <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-[#E5E5E1]">
                          <img src={m.preview} className="w-full h-full object-cover" />
                          <button 
                            onClick={() => removeMedia(i)}
                            className="absolute top-1 right-1 w-5 h-5 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={() => mediaInputRef.current?.click()}
                        className="w-20 h-20 rounded-xl border-2 border-dashed border-[#E5E5E1] hover:border-[#1A1A1A] flex items-center justify-center transition-all bg-[#FDFDFB]"
                      >
                        <Plus className="w-6 h-6 text-[#888888]" />
                      </button>
                      <input type="file" ref={mediaInputRef} className="hidden" multiple accept="image/*,video/*" onChange={handleMediaUpload} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="sticky top-32">
                <div className="bg-white border border-[#E5E5E1] rounded-[40px] p-10 shadow-2xl shadow-black/5">
                  <div className="mb-10">
                    <h2 className="text-3xl font-serif italic mb-2">Source Intel</h2>
                    <p className="text-sm text-[#888888]">Upload a PDF or import from Google Docs.</p>
                  </div>

                  <div className="space-y-8">
                    <GoogleIntegration onDocSelected={handleGenerateFromText} />
                    
                    <div className="relative py-4 flex items-center gap-4">
                      <div className="h-[1px] flex-1 bg-[#E5E5E1]"></div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">OR UPLOAD PDF</span>
                      <div className="h-[1px] flex-1 bg-[#E5E5E1]"></div>
                    </div>

                    <form onSubmit={handleGenerate} className="space-y-8">
                    {!GEMINI_API_KEY && (
                      <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-700 text-xs flex items-start gap-3">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <div>
                          <p className="font-bold mb-1">AI Analysis Restricted</p>
                          <p>Please add <code>GEMINI_API_KEY</code> to your Secrets (Settings ⚙️) to enable deep strategic analysis.</p>
                        </div>
                      </div>
                    )}
                    <div className="space-y-3">
                      <div 
                        className={`relative border-2 border-dashed rounded-3xl p-12 transition-all duration-500 flex flex-col items-center justify-center gap-6 cursor-pointer ${
                          file ? 'border-[#1A1A1A] bg-[#FDFDFB]' : 'border-[#E5E5E1] hover:border-[#1A1A1A] hover:bg-[#FDFDFB]'
                        }`}
                        onClick={() => document.getElementById('file-upload')?.click()}
                      >
                        <input 
                          id="file-upload"
                          type="file"
                          accept=".pdf"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        {file ? (
                          <>
                            <div className="w-20 h-20 bg-[#1A1A1A] rounded-full flex items-center justify-center shadow-xl shadow-black/20">
                              <FileText className="w-10 h-10 text-white" />
                            </div>
                            <div className="text-center">
                              <p className="font-bold text-lg break-all">{file.name}</p>
                              <p className="text-xs text-[#888888] uppercase tracking-widest mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="w-20 h-20 bg-[#F5F5F0] rounded-full flex items-center justify-center">
                              <Upload className="w-8 h-8 text-[#888888]" />
                            </div>
                            <div className="text-center">
                              <p className="font-bold text-lg">Select Strategy PDF</p>
                              <p className="text-xs text-[#888888] uppercase tracking-widest mt-1">Maximum 10MB</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {error && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="p-5 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm flex items-start gap-4"
                      >
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <span>{error}</span>
                      </motion.div>
                    )}

                    {status && !error && !success && (
                      <div className="flex items-center gap-4 text-[#1A1A1A] text-xs font-bold uppercase tracking-[0.2em] animate-pulse ml-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {status}
                      </div>
                    )}

                    <button 
                      type="submit"
                      disabled={isGenerating || !file}
                      className="w-full py-6 bg-[#1A1A1A] text-white font-bold rounded-full flex items-center justify-center gap-3 hover:bg-black transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed shadow-xl shadow-black/20 group"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Processing Intelligence
                        </>
                      ) : (
                        <>
                          Generate Premium Deck
                          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </motion.div>
          ) : (
            <motion.div 
              key="editor"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-5xl font-serif italic mb-4">Review & Refine</h2>
                  <p className="text-[#888888] uppercase tracking-[0.2em] text-[10px] font-bold">Tweak your strategic narrative before export.</p>
                </div>
                <div className="flex gap-4">
                  <GoogleIntegration slides={slides} deckTitle={file?.name || 'Strategic Pitch Deck'} onDocSelected={() => {}} />
                  <button 
                    onClick={saveToHistory}
                    className="px-8 py-4 border border-[#E5E5E1] rounded-full text-xs font-bold uppercase tracking-widest hover:bg-[#FDFDFB] transition-all flex items-center gap-2"
                  >
                    <History className="w-4 h-4" />
                    Save Version
                  </button>
                  <button 
                    onClick={() => setShowEditor(false)}
                    className="px-8 py-4 border border-[#E5E5E1] rounded-full text-xs font-bold uppercase tracking-widest hover:bg-[#FDFDFB] transition-all"
                  >
                    Back to Source
                  </button>
                  <button 
                    onClick={handleExport}
                    disabled={isGenerating}
                    className="px-8 py-4 bg-[#1A1A1A] text-white rounded-full text-xs font-bold uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-black/10 flex items-center gap-2"
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Export PPTX
                  </button>
                </div>
              </div>

              {/* Global Rework Box */}
              <div className="p-8 rounded-[32px] bg-[#1A1A1A] text-white shadow-2xl">
                <div className="flex items-center gap-3 mb-6">
                  <Zap className="w-5 h-5 text-amber-400" />
                  <h3 className="font-serif italic text-xl">Global Strategic Tweak</h3>
                </div>
                <div className="flex gap-4">
                  <input 
                    type="text"
                    value={globalPrompt}
                    onChange={(e) => setGlobalPrompt(e.target.value)}
                    placeholder="e.g., 'Make the tone more aggressive and focus on Gen Z market share'"
                    className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-white/40 placeholder:text-white/30"
                  />
                  <button 
                    onClick={() => reworkWholePPT(globalPrompt)}
                    disabled={isReworking || !globalPrompt}
                    className="px-8 py-4 bg-white text-[#1A1A1A] rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-white/90 transition-all disabled:opacity-50"
                  >
                    {isReworking ? 'Reworking...' : 'Rework PPT'}
                  </button>
                </div>
              </div>

              <div className="grid gap-8">
                {slides.map((slide, idx) => (
                  <motion.div 
                    key={idx}
                    layout
                    className="p-10 rounded-[40px] border border-[#E5E5E1] bg-white shadow-sm hover:shadow-xl transition-all group relative"
                  >
                    <button 
                      onClick={() => removeSlide(idx)}
                      className="absolute top-8 right-8 w-10 h-10 rounded-full border border-[#E5E5E1] flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-5 h-5" />
                    </button>

                    <div className="grid lg:grid-cols-[1fr_450px] gap-12">
                      <div className="space-y-8">
                        <SlidePreview slide={slide} index={idx} />
                        
                        <div className="flex items-center gap-4">
                          <span className="text-4xl font-serif italic text-[#E5E5E1]">{String(idx + 1).padStart(2, '0')}</span>
                          <input 
                            type="text"
                            value={slide.title}
                            onChange={(e) => updateSlide(idx, { title: e.target.value })}
                            className="text-3xl font-serif italic w-full border-b border-transparent focus:border-[#1A1A1A] focus:outline-none py-2"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-8">
                          <div className="space-y-4">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Strategic Content</label>
                            <textarea 
                              value={slide.content.join('\n')}
                              onChange={(e) => updateSlide(idx, { content: e.target.value.split('\n') })}
                              rows={6}
                              className="w-full p-6 rounded-2xl bg-[#FDFDFB] border border-[#E5E5E1] text-sm leading-relaxed focus:outline-none focus:border-[#1A1A1A]"
                            />
                          </div>
                          <div className="space-y-4">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Speaker Notes</label>
                            <textarea 
                              value={slide.speakerNotes}
                              onChange={(e) => updateSlide(idx, { speakerNotes: e.target.value })}
                              rows={6}
                              className="w-full p-6 rounded-2xl bg-[#FDFDFB] border border-[#E5E5E1] text-xs italic text-[#666666] focus:outline-none focus:border-[#1A1A1A]"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-8 border-l border-[#E5E5E1] pl-12">
                        <div className="space-y-4">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Feedback Loop</label>
                          <button 
                            onClick={() => updateSlide(idx, { visualConfig: { ...slide.visualConfig, isStyleReference: !slide.visualConfig?.isStyleReference } })}
                            className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 transition-all ${
                              slide.visualConfig?.isStyleReference 
                                ? 'bg-emerald-600 text-white shadow-lg' 
                                : 'bg-[#FDFDFB] border border-[#E5E5E1] text-[#888888] hover:border-[#1A1A1A]'
                            }`}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            {slide.visualConfig?.isStyleReference ? 'Style Reference Set' : 'Mark as Style Reference'}
                          </button>
                          <p className="text-[10px] text-[#888888] italic">AI will use this slide as a benchmark for future reworks.</p>
                        </div>

                        <div className="space-y-4">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Layout & Visuals</label>
                          <div className="grid grid-cols-2 gap-2">
                            {['TITLE', 'SPLIT', 'CONTENT', 'HERO'].map((l) => (
                              <button 
                                key={l}
                                onClick={() => updateSlide(idx, { layout: l as any })}
                                className={`py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                                  slide.layout === l ? 'bg-[#1A1A1A] text-white shadow-lg' : 'bg-[#FDFDFB] border border-[#E5E5E1] text-[#888888] hover:border-[#1A1A1A]'
                                }`}
                              >
                                {l}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Formatting Controls</label>
                          <div className="grid grid-cols-3 gap-2">
                            {['left', 'center', 'right'].map(align => (
                              <button 
                                key={align}
                                onClick={() => updateSlide(idx, { visualConfig: { ...slide.visualConfig, textAlignment: align as any } })}
                                className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${
                                  (slide.visualConfig?.textAlignment || 'left') === align ? 'bg-[#1A1A1A] text-white' : 'bg-[#F5F5F0]'
                                }`}
                              >
                                {align}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-4">
                            <label className="text-[10px] text-[#888888] shrink-0">Title Size</label>
                            <input 
                              type="range" min="20" max="80" 
                              value={slide.visualConfig?.titleSize || 32}
                              onChange={(e) => updateSlide(idx, { visualConfig: { ...slide.visualConfig, titleSize: Number(e.target.value) } })}
                              className="w-full h-1 bg-[#E5E5E1] rounded-lg appearance-none cursor-pointer accent-[#1A1A1A]"
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Rework this slide</label>
                          <div className="flex gap-2">
                            <input 
                              type="text"
                              placeholder="e.g., 'Add more market data'"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  reworkSlide(idx, (e.target as HTMLInputElement).value);
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }}
                              className="flex-1 p-3 rounded-xl bg-[#FDFDFB] border border-[#E5E5E1] text-xs focus:outline-none focus:border-[#1A1A1A]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}

                <button 
                  onClick={addSlide}
                  className="w-full py-10 rounded-[40px] border-2 border-dashed border-[#E5E5E1] hover:border-[#1A1A1A] hover:bg-white transition-all flex flex-col items-center justify-center gap-4 group"
                >
                  <div className="w-12 h-12 rounded-full bg-[#F5F5F0] flex items-center justify-center group-hover:bg-[#1A1A1A] transition-all">
                    <Plus className="w-6 h-6 text-[#888888] group-hover:text-white" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">Add Strategic Slide</span>
                </button>
              </div>

              {success && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-8 bg-emerald-50 border border-emerald-100 rounded-3xl flex items-center justify-between"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                      <CheckCircle2 className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h3 className="font-serif italic text-lg text-emerald-900">Export Successful</h3>
                      <p className="text-xs text-emerald-700 uppercase tracking-widest">Your premium deck has been downloaded.</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Premium Footer */}
      <footer className="border-t border-[#E5E5E1] py-20 px-8 mt-24 bg-white">
        <div className="max-w-[1400px] mx-auto grid md:grid-cols-3 items-center gap-12">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5" />
            <span className="font-serif italic text-xl">PitchPerfect AI</span>
          </div>
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.3em] text-[#888888]">
            © 2026 Agency Tools. Editorial Intelligence.
          </p>
          <div className="flex justify-end gap-10 text-[10px] font-bold uppercase tracking-[0.2em] text-[#888888]">
            <a href="#" className="hover:text-[#1A1A1A] transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-[#1A1A1A] transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
