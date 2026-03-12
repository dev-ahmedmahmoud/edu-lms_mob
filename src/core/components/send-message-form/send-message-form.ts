// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Component, ElementRef, input, output, model, viewChild } from '@angular/core';
import { CoreConfig } from '@services/config';
import { CoreEvents } from '@singletons/events';
import { CoreSites } from '@services/sites';
import { CoreText } from '@singletons/text';
import { CoreConstants } from '@/core/constants';
import { CoreForms } from '@singletons/form';
import { CorePlatform } from '@services/platform';
import { toBoolean } from '@/core/transforms/boolean';
import { CoreBaseModule } from '@/core/base.module';
import { CoreAutoFocusDirective } from '@directives/auto-focus';
import { CoreAutoRowsDirective } from '@directives/auto-rows';
import { CoreFaIconDirective } from '@directives/fa-icon';
import { CoreOnResizeDirective } from '@directives/on-resize';
import { CoreSupressEventsDirective } from '@directives/supress-events';
import { CoreUpdateNonReactiveAttributesDirective } from '@directives/update-non-reactive-attributes';
// -------- SYNCOLOGY: Alert for displaying errors ------- //
import { CoreAlerts } from '@services/overlays/alerts';
// ------------- SYNCOLOGY: end ------------//

/**
 * Component to display a "send message form".
 *
 * @description
 * This component will display a standalone send message form in order to have a better UX.
 *
 * Example usage:
 * <core-send-message-form (onSubmit)="sendMessage($event)" [placeholder]="'core.messages.newmessage' | translate"
 * [show-keyboard]="showKeyboard"></core-send-message-form>
 */
@Component({
    selector: 'core-send-message-form',
    templateUrl: 'core-send-message-form.html',
    styleUrl: 'send-message-form.scss',
    imports: [
        CoreBaseModule,
        CoreAutoRowsDirective,
        CoreAutoFocusDirective,
        CoreOnResizeDirective,
        CoreUpdateNonReactiveAttributesDirective,
        CoreSupressEventsDirective,
        CoreFaIconDirective,
    ],
})
export class CoreSendMessageFormComponent {

    readonly message = model(''); // Input text.
    readonly placeholder = input(''); // Placeholder for the input area.
    readonly showKeyboard = input(false, { transform: toBoolean }); // If keyboard is shown or not.
    readonly sendDisabled = input(false, { transform: toBoolean }); // If send is disabled.
    readonly onSubmit = output<string>(); // Send data when submitting the message form.
    readonly onResize = output<void>(); // Emit when resizing the textarea.

    readonly formElement = viewChild.required<ElementRef>('messageForm');

    protected sendOnEnter = false;

    // -------- SYNCOLOGY: Url for calling attachment API point ------- //
    baseApiUrl = CoreSites.getCurrentSite()?.getURL() + '/message/attachment.php';
    // ------------- SYNCOLOGY: end ------------//

    constructor() {
        CoreConfig.get(CoreConstants.SETTINGS_SEND_ON_ENTER, !CorePlatform.isMobile()).then((sendOnEnter) => {
            this.sendOnEnter = !!sendOnEnter;

            return;
        }).catch(() => {
            // Nothing to do.
        });

        CoreEvents.on(CoreEvents.SEND_ON_ENTER_CHANGED, (data) => {
            this.sendOnEnter = data.sendOnEnter;
        }, CoreSites.getCurrentSiteId());
    }

    // -------- SYNCOLOGY: Functions to handle file selection and upload ------- //
    getFiles(event: Event): void {
        const input = event.target as HTMLInputElement;
        const files = input.files;

        if (files) {
            this.uploadFile(files);
        }
    }

    handleSuccess(data: string | string[]): void {
        // response.data is an array of URLs
        const urls = Array.isArray(data)
            ? data
            : [data];
        const urlsText = urls.join('\n');

        const textarea = <HTMLInputElement>(
            document.getElementById('message-textarea')
        );
        if (textarea) {
            // Append URLs to existing text or set new text
            const currentValue = textarea.value.trim();
            textarea.value = currentValue
                ? currentValue + '\n' + urlsText
                : urlsText;
            this.submitForm();
        }
    }

    uploadFile(files: FileList): void {
        const API_ENDPOINT = this.baseApiUrl;
        const request = new window.XMLHttpRequest();
        const formData = new window.FormData();

        // Security: Accept only certain file types (e.g., images, pdf, doc)
        const allowedTypes = [
            'image/jpeg',
            'image/png',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];

        // Limits
        const sizeLimit = 40 * 1024 * 1024; // 40MB
        const totalFileLimit = 10;

        // Clear previous messages
        const responseElem = <HTMLInputElement>(
            document.getElementById('message-response')
        );
        if (responseElem) {responseElem.innerHTML = '';}

        // File count check
        if (files.length > totalFileLimit) {
            if (responseElem) {
                responseElem.innerHTML = `Exceeded total file limit. Only ${totalFileLimit} files allowed.`;
            }
            CoreAlerts.show({
                header: 'Upload Error',
                message: `Exceeded total file limit. Only ${totalFileLimit} files allowed.`,
            });

            return;
        }

        // File validation
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.size > sizeLimit) {
                if (responseElem) {
                    responseElem.innerHTML = `File "${file.name}" exceeds the 40MB size limit.`;
                }
                CoreAlerts.show({
                    header: 'Upload Error',
                    message: `File "${file.name}" exceeds the 40MB size limit.`,
                });

                return;
            }
            if (!allowedTypes.includes(file.type)) {
                if (responseElem) {
                    responseElem.innerHTML = `File type "${file.type}" is not allowed.`;
                }
                CoreAlerts.show({
                    header: 'Upload Error',
                    message: `File type "${file.type}" is not allowed.`,
                });

                return;
            }
            formData.append('files[]', file, file.name);
        }

        request.open('POST', API_ENDPOINT, true);

        // Send session cookies if your server uses them (Moodle usually does).
        request.withCredentials = true;

        // Avoid hanging requests.
        request.timeout = 10000; // 10s

        // Progress bar
        request.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percent = Math.floor((event.loaded / event.total) * 100);
                const meterElem = <HTMLInputElement>(
                    document.getElementById('meter')
                );
                if (meterElem) {meterElem.style.width = percent + '%';}
            }
        });

        request.onreadystatechange = () => {
            if (request.readyState === 4) {
                const meterElem = <HTMLInputElement>(
                    document.getElementById('meter')
                );
                if (meterElem) {meterElem.style.display = 'none';}

                const responseElem = <HTMLInputElement>(
                    document.getElementById('message-response')
                );

                // Special handling for status 0 (no HTTP response).
                if (request.status === 0) {
                    const hint = this.getStatus0Hint(API_ENDPOINT);
                    const msg = `Request failed (status 0). ${hint}`;
                    if (responseElem) {responseElem.innerText = msg;}
                    CoreAlerts.show({ header: 'Upload Error', message: msg });

                    return;
                }

                const responseText = request.responseText;
                let response;
                let errorMsg = '';
                let unknownMessage = '';

                try {
                    response = JSON.parse(responseText);
                } catch {
                    const msg = `Server Response (Status ${request.status}):\n${responseText || 'Empty response'}`;
                    if (responseElem) {responseElem.innerText = msg;}
                    CoreAlerts.show({ header: 'Upload Error', message: msg });

                    return;
                }

                if (
                    request.status === 200 &&
                    response.success &&
                    response.data
                ) {
                    this.handleSuccess(response.data);
                } else {
                    errorMsg = `Status ${request.status}: `;

                    if (response.error) {
                        errorMsg += response.error;
                    } else if (response.message) {
                        errorMsg += response.message;
                    } else if (response.data) {
                        errorMsg +=
                            typeof response.data === 'string'
                                ? response.data
                                : JSON.stringify(response.data);
                    } else {
                        unknownMessage += typeof response === 'string' ? response : JSON.stringify(response, null, 2);
                    }

                    if (request.status !== 200) {
                        CoreAlerts.show({ header: 'Upload Error', message: errorMsg });
                    } else {
                        // Clean URL: strip trailing garbage after file extension (e.g., /r/n/r/n)
                        const cleanedUrl = unknownMessage.replace(/(\.\w{3,4})\/r\/n.*$/i, '$1').trim();
                        this.handleSuccess(cleanedUrl);
                    }
                }
            }
        };

        request.onerror = () => {
            const meterElem = <HTMLInputElement>(
                document.getElementById('meter')
            );
            if (meterElem) {meterElem.style.display = 'none';}

            const responseElem = <HTMLInputElement>(
                document.getElementById('message-response')
            );
            const msg =
                'Network error. Please check your connection and try again.';
            if (responseElem) {responseElem.innerText = msg;}
            CoreAlerts.show({ header: 'Upload Error', message: msg });
        };

        request.onabort = () => {
            const meterElem = <HTMLInputElement>(
                document.getElementById('meter')
            );
            if (meterElem) {meterElem.style.display = 'none';}

            const responseElem = <HTMLInputElement>(
                document.getElementById('message-response')
            );
            const msg = 'Upload canceled before completing.';
            if (responseElem) {responseElem.innerText = msg;}
            CoreAlerts.show({ header: 'Upload Error', message: msg });
        };

        request.ontimeout = () => {
            const meterElem = <HTMLInputElement>(
                document.getElementById('meter')
            );
            if (meterElem) {meterElem.style.display = 'none';}

            const responseElem = <HTMLInputElement>(
                document.getElementById('message-response')
            );
            const msg =
                'Upload timeout. Please try again with a stable connection.';
            if (responseElem) {responseElem.innerText = msg;}
            CoreAlerts.show({ header: 'Upload Error', message: msg });
        };

        request.send(formData);
    }

    // Helper to show likely reasons for status 0 on Android.
    private getStatus0Hint(url: string): string {
        try {
            const online =
                typeof navigator !== 'undefined' ? navigator.onLine : true;
            const u = new URL(url);
            const isCleartext = u.protocol === 'http:';
            const isCrossOrigin = (() => {
                try {
                    return u.origin !== window.location.origin;
                } catch {
                    return true;
                }
            })();

            if (!online) {return 'Device appears offline.';}
            if (isCleartext) {
                return 'Cleartext HTTP may be blocked on Android 9+. Use HTTPS or enable ' +
                    'cleartext traffic in Network Security Config.';
            }
            if (isCrossOrigin) {
                return 'CORS/cookies may be blocked. Ensure server allows your app origin and send credentials if required.';
            }

            return 'SSL/certificate problems, server down, DNS failure, or the request was aborted.';
        } catch {
            return 'Network error or invalid/blocked URL.';
        }
    }

    // ------------- SYNCOLOGY: end ------------//

    /**
     * Form submitted.
     *
     * @param $event Mouse event.
     */
    submitForm($event?: Event): void {
        $event?.preventDefault();
        $event?.stopPropagation();

        // -------- SYNCOLOGY: Form Submission Logic ------- //
        const textarea = <HTMLInputElement>(
            document.getElementById('message-textarea')
        );
        this.message.set(textarea.value);
        let value = this.message().trim();

        if (!value) {
            // Silent error.
            return;
        }

        CoreForms.triggerFormSubmittedEvent(this.formElement(), false, CoreSites.getCurrentSiteId());

        value = CoreText.replaceNewLines(value, '<br>');
        this.onSubmit.emit(value);

        setTimeout(function () {
            const textarea = <HTMLInputElement>(
                document.getElementById('message-textarea')
            );
            textarea.value = '';
        }, 350);
        // ------------- SYNCOLOGY: end ------------//
    }

    /**
     * Textarea resized.
     */
    textareaResized(): void {
        this.onResize.emit();
    }

    /**
     * A11y key functionality that prevents keyDown events.
     *
     * @param e Event.
     */
    enterKeyDown(e: KeyboardEvent, other?: string): void {
        if (this.sendDisabled()) {
            return;
        }

        if (this.sendOnEnter && !other) {
            // Enter clicked, send the message.
            e.preventDefault();
            e.stopPropagation();
        } else if (!this.sendOnEnter && !CorePlatform.isMobile() && other == 'control') {
            // Cmd+Enter or Ctrl+Enter, send message.
            e.preventDefault();
            e.stopPropagation();
        }
    }

    /**
     * Enter key clicked.
     *
     * @param e Event.
     * @param other The name of the other key that was clicked, undefined if no other key.
     */
    enterKeyUp(e: Event, other?: string): void {
        if (this.sendDisabled()) {
            return;
        }

        if (this.sendOnEnter && !other) {
            // Enter clicked, send the message.
            this.submitForm(e);
        } else if (!this.sendOnEnter && !CorePlatform.isMobile() && other == 'control') {
            // Cmd+Enter or Ctrl+Enter, send message.
            this.submitForm(e);
        }
    }

}
