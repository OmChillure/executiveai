import { Canvas, createCanvas, registerFont, loadImage, Image } from 'canvas';
import path from 'path';
import * as aiModelService from '../services/ai-model.service';

export interface HandwritingResult {
  type: string;
  content: string;
  metadata?: {
    images: string[];  // Array of base64 encoded images
    text?: string;
    style?: string;
  };
  error?: string;
}

interface HandwritingOptions {
  fontSize: number;
  lineHeight: number;
  inkColor: string;
  fontFamily: string;
  maxWidth: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  lineSpacing: number;
  quality: number;
}

class HandwritingGenerator {
  private canvas!: Canvas;
  private ctx: any;
  private pageTemplate: Image | null = null;
  private options: HandwritingOptions;
  private fontLoaded: boolean = false;


  constructor() {
    this.options = {
      fontSize: 24,
      lineHeight: 1.5,
      inkColor: '#000000',
      fontFamily: 'HomemadeApple-Regular',
      maxWidth: 600,
      marginLeft: 100,
      marginRight:120,
      marginTop: 160,
      marginBottom: 100,
      lineSpacing: 1,
      quality: 0.92
    };
  }

  async initialize() {
    try {
      const fontPath = path.join(__dirname, '..', 'assets', 'fonts', 'HomemadeApple-Regular.ttf');
      console.log('Loading font from:', fontPath);

      registerFont(fontPath, {
        family: 'HomemadeApple-Regular',
        weight: 'normal',
        style: 'normal'
      });

      const pagePath = path.join(__dirname, '..', 'assets', 'papers', 'page.png');
      this.pageTemplate = await loadImage(pagePath);
      console.log('Page template loaded successfully');
    } catch (error) {
      console.error('Error loading page template:', error);
      throw new Error('Failed to load page template');
    }
  }

  private prepareCanvas() {
    if (!this.pageTemplate) {
      throw new Error('Page template not loaded. Call initialize() first.');
    }

    // Use the dimensions from the page template
    this.canvas = createCanvas(this.pageTemplate.width, this.pageTemplate.height);
    this.ctx = this.canvas.getContext('2d');

    this.ctx.drawImage(this.pageTemplate, 0, 0);

    // Set text properties
    this.ctx.font = `${this.options.fontSize}px "${this.options.fontFamily}"`;
    this.ctx.fillStyle = this.options.inkColor;
    this.ctx.textBaseline = 'alphabetic';
  }

  private wrapText(text: string): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0] || '';
    const maxWidth = this.options.maxWidth;

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = `${currentLine} ${word}`;
      const metrics = this.ctx.measureText(testLine);

      if (metrics.width > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
    return lines;
  }

  public async generatePages(text: string): Promise<string[]> {
    const pages: string[] = [];
    const paragraphs = text.split('\n');
    let currentPage: string[] = [];
    let currentY = this.options.marginTop;

    this.prepareCanvas();

    for (const paragraph of paragraphs) {
      const lines = this.wrapText(paragraph);

      for (const line of lines) {
        const lineHeight = this.options.fontSize * this.options.lineHeight;

        // Check if we need a new page
        if (currentY + lineHeight > this.canvas.height - this.options.marginBottom) {
          // Generate current page
          this.renderLines(currentPage);
          pages.push(this.canvas.toDataURL('image/jpeg', this.options.quality));

          // Start new page
          this.prepareCanvas();
          currentPage = [];
          currentY = this.options.marginTop;
        }

        currentPage.push(line);
        currentY += lineHeight + this.options.lineSpacing;
      }

      // Add extra space after paragraph
      currentY += this.options.lineSpacing * 2;
    }

    // Generate the last page if there's content
    if (currentPage.length > 0) {
      this.renderLines(currentPage);
      pages.push(this.canvas.toDataURL('image/jpeg', this.options.quality));
    }

    return pages;
  }

  private renderLines(lines: string[]) {
    let y = this.options.marginTop;

    for (const line of lines) {
      let x = this.options.marginLeft;

      // Draw each character with variations
      for (const char of line) {
        const angleVariation = (Math.random() - 0.5) * 0.05;
        const sizeVariation = 1 + (Math.random() - 0.5) * 0.03;
        const yVariation = (Math.random() - 0.5) * 2;

        this.ctx.save();
        this.ctx.translate(x, y + yVariation);
        this.ctx.rotate(angleVariation);
        this.ctx.scale(sizeVariation, sizeVariation);
        this.ctx.fillText(char, 0, 0);
        this.ctx.restore();

        x += this.ctx.measureText(char).width + 1; // Added small spacing between characters
      }

      y += this.options.fontSize * this.options.lineHeight + this.options.lineSpacing;
    }
  }
}

let generator: HandwritingGenerator | null = null;

export const processHandwritingMessage = async (
  message: string,
  modelId: string
): Promise<HandwritingResult> => {
  try {
    if (!generator) {
      generator = new HandwritingGenerator();
      await generator.initialize();
    }

    const aiResponse = await aiModelService.generateAIResponse(
      modelId,
      `Format this text for handwriting, maintaining paragraphs: ${message}`,
      "You are a helpful assistant that formats text for handwriting conversion."
    );

    const textToWrite = aiResponse.content;

    const images = await generator.generatePages(textToWrite);

    return {
      type: 'handwriting',
      content: 'Handwriting conversion completed successfully.',
      metadata: {
        images,
        text: textToWrite
      }
    };
  } catch (error) {
    console.error('Error processing handwriting:', error);
    return {
      type: 'error',
      content: `Failed to process handwriting: ${(error as Error).message}`,
      error: (error as Error).message
    };
  }
};