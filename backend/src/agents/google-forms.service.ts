import axios from 'axios';
import * as cheerio from 'cheerio';
import * as aiModelService from '../services/ai-model.service';

export interface FormField {
  id: string;
  title: string;
  type: string;
  required: boolean;
  options?: string[];
  description?: string;
}

export interface GoogleForm {
  formId: string;
  title: string;
  description?: string;
  fields: FormField[];
}

export interface FormAnalysisResult {
  formData: any;
  formId: any;
  type: string;
  content: string;
  form?: GoogleForm;
  answers?: Record<string, string | string[]>;
  error?: string;
}

/**
 * Extract form ID from Google Forms URL
 */
export const extractFormId = (url: string): string | null => {
  try {
    const patterns = [
      /forms\.gle\/([a-zA-Z0-9_-]+)/,
      /forms\/d\/e\/([a-zA-Z0-9_-]+)\/viewform/,
      /forms\/d\/([a-zA-Z0-9_-]+)\/viewform/,
      /forms\/([a-zA-Z0-9_-]+)\/viewform/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }

    if (url.match(/^[a-zA-Z0-9_-]+$/)) {
      return url;
    }

    return null;
  } catch (error) {
    console.error('Error extracting form ID:', error);
    return null;
  }
};

/**
 * Scrape Google Form content
 */
const scrapeGoogleForm = async (formId: string): Promise<GoogleForm> => {
  try {
    const url = `https://docs.google.com/forms/d/e/${formId}/viewform`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    const $ = cheerio.load(response.data);
    const fields: FormField[] = [];

    // Find all form elements that could be questions
    $('[role="listitem"]').each((index, element) => {
      const $question = $(element);
      
      // Get question title
      const title = $question.find('[role="heading"]').text().trim();
      if (!title) return;

      // Initialize field data
      let type = 'text';
      const options: string[] = [];
      let required = false;

      // Check for required marker
      required = $question.find('[aria-label*="Required"]').length > 0;

      // Check for radio options
      const radioInputs = $question.find('[role="radio"]');
      if (radioInputs.length > 0) {
        type = 'radio';
        radioInputs.each((_, radio) => {
          const label = $(radio).closest('[role="presentation"]').text().trim();
          if (label) options.push(label);
        });
      }

      // Check for checkbox options
      const checkboxInputs = $question.find('[role="checkbox"]');
      if (checkboxInputs.length > 0) {
        type = 'checkbox';
        checkboxInputs.each((_, checkbox) => {
          const label = $(checkbox).closest('[role="presentation"]').text().trim();
          if (label) options.push(label);
        });
      }

      // Check for dropdown options
      const dropdownInputs = $question.find('select option');
      if (dropdownInputs.length > 0) {
        type = 'select';
        dropdownInputs.each((_, option) => {
          const label = $(option).text().trim();
          if (label) options.push(label);
        });
      }

      // Get description/help text if any
      const description = $question.find('.freebirdFormviewerViewItemsItemItemHelpText').text().trim();

      fields.push({
        id: `field_${index}`,
        title,
        type,
        required,
        options: options.length > 0 ? options : undefined,
        description: description || undefined
      });
    });

    return {
      formId,
      title: $('title').text().trim() || 'Untitled Form',
      description: $('.freebirdFormviewerViewHeaderDescription').text().trim() || undefined,
      fields
    };
  } catch (error) {
    console.error('Error scraping form:', error);
    throw new Error(`Failed to scrape form: ${(error as Error).message}`);
  }
};

/**
 * Generate AI responses for form fields
 */
const generateFormResponses = async (
  form: GoogleForm,
  modelId: string
): Promise<Record<string, string | string[]>> => {
  const answers: Record<string, string | string[]> = {};

  // Create a context prompt with form information
  const formContext = `
  Form Title: ${form.title}
  ${form.description ? `Description: ${form.description}` : ''}
  
  Please analyze each question and provide appropriate responses.
  Be specific and choose from the provided options when available.
  `;

  // Process each question
  for (const field of form.fields) {
    const prompt = `
    ${formContext}
    
    Question: ${field.title}
    ${field.description ? `Additional Info: ${field.description}` : ''}
    Question Type: ${field.type}
    ${field.options ? `Available Options:\n${field.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}` : ''}
    Required: ${field.required ? 'Yes' : 'No'}

    Please provide a direct answer to this question.
    ${field.type === 'checkbox' ? 'You may select multiple options.' : ''}
    ${field.type === 'radio' || field.type === 'select' ? 'Select exactly one option.' : ''}
    ${!field.options ? 'Provide a clear and concise response.' : ''}
    `;

    try {
      const response = await aiModelService.generateAIResponse(modelId, prompt);
      const answer = response.content.trim();

      // Process the answer based on field type
      if (field.type === 'checkbox' && field.options) {
        // For checkbox, allow multiple selections
        const selectedOptions = answer.split(',').map((opt: string) => opt.trim());
        answers[field.id] = selectedOptions;
      } else if ((field.type === 'radio' || field.type === 'select') && field.options) {
        // For radio/select, ensure single selection
        answers[field.id] = answer.split(',')[0].trim();
      } else {
        // For text and other types
        answers[field.id] = answer;
      }
    } catch (error) {
      console.error(`Error generating answer for question "${field.title}":`, error);
      answers[field.id] = '[Error generating response]';
    }
  }

  return answers;
};

/**
 * Process a Google Forms message
 */
export const processFormsMessage = async (
  message: string,
  modelId: string
): Promise<FormAnalysisResult> => {
  try {
    // Extract form URL or ID
    const urlMatch = message.match(/(https?:\/\/[^\s]+)/);
    let formId = urlMatch ? extractFormId(urlMatch[0]) : message.trim();

    if (!formId) {
      return {
        type: 'error',
        content: "Invalid Google Forms URL or ID",
        formData: null,
        formId: null
      };
    }

    // Get form structure and questions
    const form = await scrapeGoogleForm(formId);

    if (!form.fields || form.fields.length === 0) {
      return {
        type: 'error',
        content: "No questions found in the form. It might be private or require authentication.",
        formData: null,
        formId: null
      };
    }

    // Generate answers
    const answers = await generateFormResponses(form, modelId);

    // Create formatted output
    let content = `# Form Analysis\n\n`;
    content += `## Form Details\n`;
    content += `Title: ${form.title}\n`;
    if (form.description) {
      content += `Description: ${form.description}\n`;
    }
    content += `\n## Questions and Answers\n\n`;

    form.fields.forEach((field, index) => {
      content += `### Question ${index + 1}: ${field.title}\n`;
      if (field.description) {
        content += `Description: ${field.description}\n`;
      }
      content += `Type: ${field.type}\n`;
      content += `Required: ${field.required ? 'Yes' : 'No'}\n`;
      
      if (field.options) {
        content += `Options:\n${field.options.map(opt => `- ${opt}`).join('\n')}\n`;
      }
      
      content += `Answer: ${Array.isArray(answers[field.id]) ? 
        (answers[field.id] as string[]).join(', ') : 
        answers[field.id]}\n\n`;
    });

    return {
      type: 'forms_analysis',
      content,
      form,
      answers,
      formData: form,
      formId: formId
    };

  } catch (error) {
    console.error('Error processing form:', error);
    return {
      type: 'error',
      content: `Failed to process form: ${(error as Error).message}`,
      error: (error as Error).message,
      formData: null,
      formId: null
    };
  }
};