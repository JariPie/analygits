import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";

export async function exportDoc(metadataXml: string, editorContent: string) {
    // Simple clean up of HTML tags for the prototype. 
    // For a real app, we'd traverse the Tiptap JSON or use an HTML-to-Docx converter.
    // Here we just dump the text.

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = editorContent;
    const cleanText = tempDiv.innerText;

    const doc = new Document({
        sections: [
            {
                properties: {},
                children: [
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "SAP Documentation",
                                bold: true,
                                size: 32,
                            }),
                        ],
                    }),
                    new Paragraph({
                        text: " "
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: cleanText,
                                size: 24,
                            }),
                        ],
                    }),
                    new Paragraph({
                        text: " "
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Metadata Reference:",
                                bold: true
                            })
                        ]
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: metadataXml.substring(0, 500) + "...",
                                italics: true,
                                size: 20
                            })
                        ]
                    }),
                ],
            },
        ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, "SAP_Documentation.docx");
}
