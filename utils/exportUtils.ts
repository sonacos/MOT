// A global cache for loaded script promises to avoid reloading.
const loadedScripts: Record<string, Promise<void>> = {};

/**
 * Dynamically loads a script and returns a promise that resolves when it's loaded.
 * @param src The URL of the script to load.
 */
function loadScript(src: string): Promise<void> {
    if (loadedScripts[src]) {
        return loadedScripts[src];
    }

    const promise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    });

    loadedScripts[src] = promise;
    return promise;
}

// A single promise to ensure both libraries are loaded, and only once.
let pdfLibrariesPromise: Promise<[void, void]> | null = null;

function ensurePdfLibrariesLoaded(): Promise<[void, void]> {
    if (!pdfLibrariesPromise) {
        pdfLibrariesPromise = Promise.all([
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
        ]);
    }
    return pdfLibrariesPromise;
}


/**
 * Clones a DOM element and cleans it for export by replacing inputs with their values.
 * @param elementId The ID of the element to clone.
 * @returns A cleaned HTMLElement or null if the original element is not found.
 */
function getCleanClonedElement(elementId: string): HTMLElement | null {
    const originalElement = document.getElementById(elementId);
    if (!originalElement) {
        console.error(`Element with id "${elementId}" not found.`);
        return null;
    }
    
    const clone = originalElement.cloneNode(true) as HTMLElement;

    // For tables with inputs, replace them with their static values
    const inputs = clone.querySelectorAll('input[type="number"], input[type="text"]');
    inputs.forEach(inputNode => {
        const input = inputNode as HTMLInputElement;
        const value = input.value.trim();
        const cell = input.parentElement;
        if (cell) {
            const textNode = document.createTextNode(value || '-');
            cell.innerHTML = ''; // Clear the cell content (the input)
            cell.appendChild(textNode);
            // Re-apply styles that might be lost
            cell.style.textAlign = 'center';
            cell.style.padding = '0.5rem';
        }
    });

    // Remove any interactive elements that shouldn't be in the export
    clone.querySelectorAll('button, [data-no-export]').forEach(btn => btn.remove());
    
    return clone;
}

/**
 * Prints the content of a DOM element.
 * @param elementId The ID of the element to print.
 * @param title The title of the printed document.
 * @param orientation The page orientation for printing.
 */
export const printElement = (elementId: string, title: string, orientation: 'portrait' | 'landscape' = 'landscape') => {
    const cleanElement = getCleanClonedElement(elementId);
    if (!cleanElement) return;

    const printWindow = window.open('', '', 'height=800,width=1200');
    if (!printWindow) {
        alert("Impossible d'ouvrir la fenêtre d'impression. Veuillez vérifier les paramètres de votre navigateur.");
        return;
    }

    const isReport = cleanElement.classList.contains('printable-report');
    const titleHtml = isReport ? '' : `<h1 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 1rem;">${title}</h1>`;

    printWindow.document.write(`
        <html>
            <head>
                <title>${title}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    @page { 
                        size: A4 ${orientation}; 
                        margin: 0;
                    }
                    body { 
                        font-family: Arial, sans-serif; 
                        -webkit-print-color-adjust: exact; 
                        margin: 0;
                        padding: 0.375in;
                    }
                    
                    .printable-a4 {
                        padding: 0 !important;
                    }

                    .printable-report { 
                        font-size: 9pt !important;
                    }
                    .printable-report h1, .printable-report .text-2xl { font-size: 16pt !important; }
                    .printable-report .text-lg { font-size: 11pt !important; }
                    .printable-report .text-md { font-size: 10pt !important; }
                    .printable-report .text-sm { font-size: 9pt !important; }
                    .printable-report .text-xs { font-size: 8pt !important; }
                    
                    /* Spacing */
                    .printable-report .my-10 { margin-top: 1rem !important; margin-bottom: 1rem !important; }
                    .printable-report .mt-auto { margin-top: auto !important; }
                    .printable-report .mb-16 { margin-bottom: 4rem !important; }
                    .printable-report .py-2 { padding-top: 4px !important; padding-bottom: 4px !important; }
                    .printable-report .px-4 { padding-left: 6px !important; padding-right: 6px !important; }
                    .printable-report .pr-4 { padding-right: 6px !important; }
                    .printable-report .pl-4 { padding-left: 6px !important; }
                    .printable-report .mt-1 { margin-top: 2px !important; }
                    .printable-report .space-y-0\\.5 > :not([hidden]) ~ :not([hidden]) { margin-top: 2px !important; }

                    .printable-report .break-inside-avoid { page-break-inside: avoid; }
                    
                    /* Table styles */
                    .printable-report table { 
                        width: 100%; 
                        border-collapse: collapse; 
                        table-layout: fixed; 
                    }
                    .printable-report th, .printable-report td { 
                        border: 1px solid #ccc; 
                        padding: 4px 5px; 
                        text-align: left; 
                        word-wrap: break-word;
                        vertical-align: top;
                    }
                    .printable-report thead { background-color: #F3F4F6 !important; }
                    .printable-report thead th { font-weight: bold !important; border-bottom: 2px solid #333 !important; }
                    .printable-report tbody tr { page-break-inside: avoid; } 
                    .printable-report .text-center { text-align: center !important; }
                    .printable-report .font-bold { font-weight: bold !important; }
                    
                    /* Column widths for the report table */
                    .printable-report .w-1\\/4 { width: 25% !important; }
                    .printable-report .w-2\\/5 { width: 40% !important; }
                    .printable-report .w-\\[15\\%\\] { width: 15% !important; }
                    .printable-report .w-1\\/5 { width: 20% !important; }
                    
                    /* Generic table styles for other views */
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
                    thead { background-color: #f1f5f9 !important; }
                    tr { page-break-inside: avoid; }
                    .text-center { text-align: center !important; }
                    .font-semibold { font-weight: 600; }
                </style>
            </head>
            <body>
                ${titleHtml}
                ${cleanElement.innerHTML}
            </body>
        </html>
    `);
    printWindow.document.close();

    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    }, 500); // Timeout to allow assets to load
};

/**
 * Exports an HTML table to an Excel file (.xls).
 * @param elementId The ID of the container element with a table inside.
 * @param fileName The name of the file to download.
 */
export const exportToExcel = (elementId: string, fileName: string) => {
    const cleanElement = getCleanClonedElement(elementId);
    if (!cleanElement) return;
    
    const tableHTML = cleanElement.querySelector('table')?.outerHTML || '<table><tr><td>Aucune donnée</td></tr></table>';

    const style = `
        <style>
            table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; }
            th, td { border: 1px solid #dee2e6; padding: 8px; }
            thead { background-color: #f1f5f9; font-weight: bold; }
        </style>
    `;

    const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset='UTF-8'>
                ${style}
            </head>
            <body>
                ${tableHTML}
            </body>
        </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

/**
 * Exports a DOM element to a single-page PDF file using html2canvas and jsPDF.
 * This function now dynamically loads the required libraries to prevent race conditions.
 * @param elementId The ID of the element to capture.
 * @param fileName The name of the PDF file.
 * @param orientation 'portrait' or 'landscape'.
 */
export const exportToPDF = async (elementId: string, fileName:string, orientation: 'portrait' | 'landscape' = 'landscape') => {
    try {
        await ensurePdfLibrariesLoaded();
    } catch (error) {
        console.error(error);
        alert("Impossible de charger les librairies d'exportation PDF. Veuillez vérifier votre connexion internet et réessayer.");
        return;
    }
    
    // The libraries are now guaranteed to be on the window object.
    const { jsPDF } = (window as any).jspdf;
    const html2canvas = (window as any).html2canvas;
    
    const clone = getCleanClonedElement(elementId);
    if (!clone) return;

    const isLandscape = orientation === 'landscape';

    // Set a base width to ensure html2canvas captures the full width of the table.
    const table = clone.querySelector('table');
    const baseWidth = table ? Math.max(table.scrollWidth, isLandscape ? 1100 : 800) : (isLandscape ? 1100 : 800);
    
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.width = `${baseWidth}px`;
    clone.style.backgroundColor = 'white';
    clone.style.padding = '0';
    document.body.appendChild(clone);

    try {
        const canvas = await html2canvas(clone, { 
            scale: 2, // A good balance of quality and performance
            useCORS: true,
            logging: false,
            windowWidth: clone.scrollWidth,
            windowHeight: clone.scrollHeight
        });

        document.body.removeChild(clone);

        const imgData = canvas.toDataURL('image/png');
        
        const margin = 9.5; // ~0.375 inch margin
        const pageWidth = isLandscape ? 297 : 210;
        const pageHeight = isLandscape ? 210 : 297;
        const contentWidth = pageWidth - (margin * 2);
        const contentHeight = pageHeight - (margin * 2);

        const canvasAspectRatio = canvas.width / canvas.height;
        let finalWidth, finalHeight;

        // Scale the image to fit within the page's content area while maintaining aspect ratio
        if ((contentWidth / contentHeight) > canvasAspectRatio) {
            // Fit to height
            finalHeight = contentHeight;
            finalWidth = contentHeight * canvasAspectRatio;
        } else {
            // Fit to width
            finalWidth = contentWidth;
            finalHeight = contentWidth / canvasAspectRatio;
        }

        const pdf = new jsPDF({
            orientation: orientation,
            unit: 'mm',
            format: 'a4'
        });

        // Add the single, scaled image to the PDF
        pdf.addImage(imgData, 'PNG', margin, margin, finalWidth, finalHeight);

        pdf.save(`${fileName}.pdf`);

    } catch (error) {
        console.error("Erreur lors de la génération du PDF:", error);
        alert("Une erreur est survenue lors de la création du PDF.");
        if (clone.parentElement) {
            document.body.removeChild(clone);
        }
    }
};