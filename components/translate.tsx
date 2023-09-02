// This component contains controls that allow the user to input text (up to 4000 tokens worth) and submit it to be translated from English to Samoan or Samoan to English.
// There should be a text area to capture the user's input.
// There should be a toggle swith to select the direction of translation. (English to Samoan or Samoan to English)
// There should be a button submit and a button to clear the text area.
// And finally, of course, there should be a text display to display the translated text. 
// We will want users to be able to cut and paste easily from this display (we could add a clipboard copy button.)
// Oh, very importantly, we want to be able to capture user feedback on the translation. So, we need controls for thumbs up, thumbs down, and (maybe) a text area for comments.
'use client';
import Container from "./container";
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const dbClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PRIVATE_KEY
);

export default function Translate() {
    const [translateMode, setTranslateMode] = useState("toSamoan");
    const [upvoteDisabled, setUpvoteDisabled] = useState(true);
    const [downvoteDisabled, setDownvoteDisabled] = useState(true);
    const [sourceLang, setSourceLang] = useState("en");
    const [targetLang, setTargetLang] = useState("sm");
    const [input, setInput] = useState("");
    const [clipboardBtnText, setClipboardBtnText] = useState("Copy to Clipboard");
    const [modelConfigId, setModelConfigId] = useState(1);
    const [userId, setUserId] = useState(1); // later we can add users

    const [inflight, setInflight] = useState(false);
    const [results, setResults] = useState("Results will appear here.");
    const [transactionId, setTransactionId] = useState(""); //this id for translation will be used to assign the feedback to the correct translation record

    // Eventually should move this to a route  
    // returns the transactionId
    const writeTranslationToDb = async (resultsText: String) => {
        let transactionId = "";
        console.log("writing to db for sourcelang " + sourceLang + " and targetlang " + targetLang);
        try {
            let { data, error } = await dbClient
                .from('translations')
                .insert({ user_id: userId, model_config: modelConfigId, prompt: input, source_lang: sourceLang, target_lang: targetLang, response: resultsText })
                .select();
            if (error) {
                console.log("m " + error.message);
                console.log("h " + error.hint);
                console.log("d " + error.details);
                return transactionId;
            }
            if (data) {
                console.log('data is not null');
                transactionId = data[0].transaction_id;
            }
        } catch (error) {
            console.log('New transaction insert error', error);
        } finally {
            return transactionId;
        }
    }

    const updateTranslationWithFeedback = async (feedback: String, transactionId: String) => {
        console.log("updating db with feedback " + feedback + " for transactionId " + transactionId);
        try {
            let { data, error } = await dbClient
                .from('translations')
                .update({ feedback_state: feedback })
                .eq('transaction_id', transactionId)
            if (error) {
                console.log("m " + error.message);
            } else {
                console.log('feedback updated');
            }
        } catch (error) {
            console.log('Feedback update error', error);
        }
    }

    const updateTranslateMode = (value: string) => {
        setTranslateMode(value);
        //flip the source and target languages
        if (value === "toSamoan") {
            setSourceLang("en");
            setTargetLang("sm");
        } else if (value === "toEnglish") {
            setSourceLang("sm");
            setTargetLang("en");
        }
    }

    const handleInputChange = (value: string) => {
        setInput(value);
        //enable btnSubmit if input is not empty
        if (value.length > 0) {
            document.getElementById("btnSubmit")!.removeAttribute("disabled");
        } else {
            document.getElementById("btnSubmit")!.setAttribute("disabled", "true");
        }
        //check if the btnSubmit is enabled
    };

    const handleClear = () => {
        setInput("");
        setResults("");
        setTransactionId("");
        document.getElementById("btnSubmit")!.setAttribute("disabled", "true");
        disableFeedbackButtons();
        setClipboardBtnText("Copy to Clipboard");
        document.getElementById("btnUpvote")!.innerText = "👍 lelei";
        document.getElementById("btnDownvote")!.innerText = "👎 leaga";
    };

    const handleClippy = (value: string) => {
        navigator.clipboard.writeText(value);
        //write a clipboard icon to the clipboard button text
        setClipboardBtnText("Copied. 📋");
    };

    const enableFeedbackButtons = () => {
        //enable the feedback buttons
        setUpvoteDisabled(false);
        setDownvoteDisabled(false);
    };

    const disableFeedbackButtons = () => {
        //disable the feedback buttons and clear out any checkmarks from the text
        setUpvoteDisabled(true);
        setDownvoteDisabled(true);
    };

    const handleUpvote = () => {
        console.log("upvote clicked");
        //change the text of the feedback button
        document.getElementById("btnUpvote")!.innerText = "👎 leaga ☑️";
        //disable the feedback buttons
        disableFeedbackButtons();
        //update the translation record with the feedback
        updateTranslationWithFeedback("upvote", transactionId);
    }


    const handleDownvote = async () => {
        console.log("downvote clicked");
        //change the text of the feedback button
        document.getElementById("btnDownvote")!.innerText = "👎 leaga ☑️";
        //disable the feedback buttons
        disableFeedbackButtons();
        //update the translation record with the feedback
        updateTranslationWithFeedback("downvote", transactionId);
    };

    const submitHandler = useCallback(
        async (e: FormEvent) => {
            e.preventDefault();
            console.log('in event');

            // first, get a generated transactionId from supabase. This will allow us to track the user feedback for this translation.
            // using the Supabase client

            // Prevent multiple submissions.
            if (inflight) return;

            // Reset results
            setInflight(true);
            setResults("");

            try {
                console.log('streaming');
                console.log('modelConfigId: ' + modelConfigId);
                //determine which translateMode we are in by reading the radio button value
                await fetchEventSource('/api/translate', {
                    method: 'POST',
                    body: JSON.stringify({ translateMode: translateMode, input: input, modelConfigId: modelConfigId }), //modelConfig is hard-coded for now
                    headers: { 'Content-Type': 'application/json' },
                    onmessage(ev) {
                        setResults((r) => r + ev.data);
                    },
                    
                });
                // get the inner text of the resultsTextArea and write it to the database.
                //note that there should be a better stateful way to do this.
                const resultsText = document.getElementById("resultsTextArea")!.innerText;
                const tId = await writeTranslationToDb(resultsText);
                console.log('transactionId: ' + tId);
                setTransactionId(tId);
                enableFeedbackButtons();
            } catch (error) {
                console.error(error);
                setResults("An error has occurred. Please try again. Error: " + error + ".");
            } finally {
                setInflight(false);
            }
        },
        [input, inflight]
    );

    return (
        <Container className="mb-20">
            {/* Row for all of the controls and operations */}
            <div className="flex flex-wrap lg:flex-nowrap justify-center align-start gap-4 h-5/6">
                {/* All right, we now start on the left side with a half-width column containing a control strip at the top and a text area below. */}
                <div className="translate-pane-left">
                    {/* Here is the control strip */}
                    <form onSubmit={submitHandler}>
                        <div className="control-strip">
                            {/* Here is the toggle switch to select the direction of translation. (English to Samoan or Samoan to English) */}
                            <div className="grid grid-cols-3">
                                <div className="col-span-2 ">
                                    <div>
                                        <div className="flex items-center pl-4 border border-gray-200 rounded dark:border-gray-700">
                                            <input type="radio" defaultChecked id="translate-mode-1" name="translate-mode" value="toSamoan"
                                                onChange={(e) => updateTranslateMode(e.target.value)} />
                                            <label htmlFor="translate-mode-1" className="ml-3 text-gray-700 dark:text-gray-300">English to Samoan</label>
                                        </div>
                                        <div className="flex items-center pl-4 border border-gray-200 rounded dark:border-gray-700">
                                            <input type="radio" id="translate-mode-2" name="translate-mode" value="toEnglish"
                                                onChange={(e) => updateTranslateMode(e.target.value)} />
                                            <label htmlFor="translate-mode-2" className="ml-3 text-gray-700 dark:text-gray-300">Samoan to English</label>
                                        </div>
                                    </div>
                                </div>
                                {/* // Here is the button to clear the text area. */}
                                <div className="flex justify-end col-span-1 gap-1">
                                    <div>
                                        <button className="control-strip-item" id="btnClear" type="reset" onClick={handleClear}>Clear</button>
                                    </div>
                                    {/* // Here is the button to submit the text area. */}
                                    <div>
                                        <button className="control-strip-item font-bold" id="btnSubmit" type="submit" disabled>Submit</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* // Here is the text area with a placeholder communicating the maximum number of tokens (let's just say 2000 Characters) allowed. */}
                        <div className="text-input-container">
                            <textarea id="textInputArea" className="text-input-area" placeholder="Enter text to be translated (up to 2000 characters) here."
                                onChange={(e) => handleInputChange(e.target.value)}>
                            </textarea>
                        </div>
                    </form>
                </div>

                {/* // Now we move to the right side with a half-width column containing a control strip at the top and the results pane below. */}
                <div className="translate-pane-right">
                    {/* // Here is the control strip */}
                    <div className="control-strip">
                        <div className="grid grid-cols-3">
                            {/* // Here is the button to copy the results pane to the clipboard. */}
                            <div className="col-span-2 ">
                                <button className="control-strip-item" id="btnCopy"
                                    onClick={(e) => handleClippy(results)}>{clipboardBtnText}</button>
                            </div>
                            {/* // Here is the thumbs up button. */}
                            <div className="flex justify-end col-span-1 gap-1">
                                <div>
                                    <button className="control-strip-item"
                                        disabled={upvoteDisabled}
                                        id="btnUpvote"
                                        onClick={(e) => handleUpvote()}>👍 lelei</button>
                                </div>
                                {/* // Here is the thumbs down button. */}
                                <div>
                                    <button className="control-strip-item"
                                        disabled={downvoteDisabled}
                                        id="btnDownvote"
                                        onClick={(e) => handleDownvote()}>👎 leaga</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* // Here is the results pane. It's a div with a preformatted text area inside. It will scroll if the text is too long. */}
                    <div className="results-container">
                        <pre id="resultsTextArea" className="results-text-area">{results}</pre>
                    </div>
                </div>
            </div>
            {/* We have a hideable technical options section in a new row next, which is a collapsed div with an unhide-button */}
            <hr className="mt-10"></hr>
            <div className="technical-options flex justify-center mt-5">
                <div className="grid grid-rows-2">
                    <div className="row flex justify-center">
                        <h2 className="justify-center mb-5">Fa'amatalaga fa'apitoa <em>(Technical details)</em></h2>
                    </div>
                    <div className="row flex gap-4 grid-cols-2 justify-center">
                        <div className="col-span-1">
                            {/* model selector dropdown with the two hardcoded options for now */}
                            <select className="form-select control-strip-item" id="modelSelector" onChange={(e) => setModelConfigId(Number(e.target.value))}>
                                <option value="1">GPT-4 (default model)</option>
                                <option value="2">GPT-3.5</option>
                                <option value="3">LLama 2 70B (can be slow)</option>
                            </select>
                        </div>
                        <div className="col-span-1">
                            <pre className="text-sm">Application version 0.0.1</pre>
                        </div>
                    </div>

                </div>

            </div>
        </Container>
    );
}





