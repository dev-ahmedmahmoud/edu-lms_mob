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
// -------- SYNCOLOGY: Child Type Import ------- //
import { Child } from '@features/courses/services/child-courses';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { inject } from '@angular/core';
// ------------- SYNCOLOGY: end ------------//

import { Component, OnDestroy, OnInit, signal, viewChildren } from '@angular/core';
import { CoreCourses } from '../../services/courses';
import { CoreEventObserver, CoreEvents } from '@singletons/events';
import { CoreSites } from '@services/sites';
import { CoreCoursesDashboard } from '@features/courses/services/dashboard';
import { CoreCourseBlock } from '@features/course/services/course';
import { CoreBlockComponent } from '@features/block/components/block/block';
import { CoreNavigator } from '@services/navigator';
import { CoreBlockDelegate } from '@features/block/services/block-delegate';
import { CoreTime } from '@singletons/time';
import { CoreAnalytics, CoreAnalyticsEventType } from '@services/analytics';
import { Translate } from '@singletons';
import { CorePromiseUtils } from '@singletons/promise-utils';
import { CoreAlerts } from '@services/overlays/alerts';
import { CoreBlockSideBlocksButtonComponent } from '../../../block/components/side-blocks-button/side-blocks-button';
import { CoreSharedModule } from '@/core/shared.module';
import { CORE_BLOCKS_DASHBOARD_FALLBACK_BLOCKS } from '@features/block/constants';

/**
 * Page that displays the dashboard page.
 */
@Component({
    selector: 'page-core-courses-dashboard',
    templateUrl: 'dashboard.html',
    imports: [
        CoreSharedModule,
        CoreBlockComponent,
        CoreBlockSideBlocksButtonComponent,
    ],
})
export default class CoreCoursesDashboardPage implements OnInit, OnDestroy {

    readonly blocksComponents = viewChildren(CoreBlockComponent);

    hasMainBlocks = false;
    hasSideBlocks = false;
    searchEnabled = false;
    downloadCourseEnabled = false;
    downloadCoursesEnabled = false;
    userId?: number;
    readonly blocks = signal<Partial<CoreCourseBlock>[]>([]);
    loaded = false;

    protected updateSiteObserver: CoreEventObserver;
    protected logView: () => void;
    // -------- SYNCOLOGY: HttpClient Import ------- //
    protected http = inject(HttpClient);
    // ------------- SYNCOLOGY: end ------------//

    constructor() {
        // Refresh the enabled flags if site is updated.
        this.updateSiteObserver = CoreEvents.on(CoreEvents.SITE_UPDATED, () => {
            this.searchEnabled = !CoreCourses.isSearchCoursesDisabledInSite();
            this.downloadCourseEnabled = !CoreCourses.isDownloadCourseDisabledInSite();
            this.downloadCoursesEnabled = !CoreCourses.isDownloadCoursesDisabledInSite();

        }, CoreSites.getCurrentSiteId());

        this.logView = CoreTime.once(async () => {
            await CorePromiseUtils.ignoreErrors(CoreCourses.logView('dashboard'));

            CoreAnalytics.logEvent({
                type: CoreAnalyticsEventType.VIEW_ITEM,
                ws: 'core_my_view_page',
                name: Translate.instant('core.courses.mymoodle'),
                data: { category: 'course', page: 'dashboard' },
                url: '/my/',
            });
        });
    }

    /**
     * @inheritdoc
     */
    ngOnInit(): void {
        this.searchEnabled = !CoreCourses.isSearchCoursesDisabledInSite();
        this.downloadCourseEnabled = !CoreCourses.isDownloadCourseDisabledInSite();
        this.downloadCoursesEnabled = !CoreCourses.isDownloadCoursesDisabledInSite();

        this.loadContent();
    }

    // -------- SYNCOLOGY: Get Children Logic ------- //

    checkImageUrl(url: string): string{
        let imageUrl = '';
        if (url && url.trim() !== ''){
            imageUrl = url;
        } else {
            imageUrl = 'assets/img/user-avatar.png';
        }

        return imageUrl;
    }

    /**
     * Refresh the dashboard data.
     */
    async getChildren(): Promise<void> {
        this.getChildrenData().subscribe(data => {
            if (data) {
                const children: Child[] = [];
                let jsonObj = data;
                if (typeof data === 'string') {
                    jsonObj = JSON.parse(data);
                }

                for (const childKey in jsonObj){
                    if (Object.prototype.hasOwnProperty.call(jsonObj, childKey)) {
                        const childObj: Child = {
                            child_email: jsonObj[childKey]['child_email'],
                            child_id: jsonObj[childKey]['child_id'],
                            child_image_url:  this.checkImageUrl(jsonObj[childKey]['child_image_url']) || 'assets/img/user-avatar.png',
                            child_name: jsonObj[childKey]['child_name'],
                            child_courses: '',
                            childCourses: [],
                            child_reportlink:  jsonObj[childKey]['child_reportlink'],
                        };
                        const child_courses: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
                        for (const childCourseKey in jsonObj[childKey]['child_courses']){
                            childObj.childCourses?.push(
                                {
                                    id: jsonObj[childKey]['child_courses'][childCourseKey]['id'],
                                    courseImageUrl: '',
                                    name:jsonObj[childKey]['child_courses'][childCourseKey]['name'],
                                },
                            );
                            child_courses.push(jsonObj[childKey]['child_courses'][childCourseKey]['id']);
                        }

                        childObj.child_courses = child_courses.toString();
                        childObj.onChildClick = (child: Child) => {
                            CoreNavigator.navigate('../childdetail', { // Navigate to sibling route
                                params: { child },
                            });
                        };
                        children.push(childObj);
                    }
                }

                this.blocks.update(blocks => {
                    const filtered = blocks.filter((block: CoreCourseBlock) =>
                        block.name !== 'parents' && block.name !== 'myoverview');

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return [{
                        name: 'mychildren',
                        visible: true,
                        contents: { localContents: { children } } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    } as Partial<CoreCourseBlock>, ...filtered];
                });
            }
        });
    }

    getChildrenData(): Observable<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
        const userId = this.userId ? this.userId : CoreSites.getCurrentSiteUserId();
        const currentSite = CoreSites.getCurrentSite();
        const currentSiteUrl = currentSite?.siteUrl;
        // Use responseType 'text' if we need to parse, but let's try default (json) and handle type.
        const url = `${currentSiteUrl}/webservice/rest/server.php?wstoken=6cfa7f60bf579ba0d59b779bad638364` +
            `&wsfunction=get_child&moodlewsrestformat=json&parentid=${userId}`;

        // Using {responseType: 'text'} to match source behavior if it expected string.
        // Actually, let's use default (json) and NOT parse if it's already object.
        return this.http.get(url);
    }
    // ------------- SYNCOLOGY: end ------------//

    /**
     * Convenience function to fetch the dashboard data.
     *
     * @returns Promise resolved when done.
     */
    protected async loadContent(): Promise<void> {
        const available = await CoreCoursesDashboard.isAvailable();
        const disabled = await CoreCoursesDashboard.isDisabled();

        if (available && !disabled) {
            this.userId = CoreSites.getCurrentSiteUserId();

            try {
                const blocks = await CoreCoursesDashboard.getDashboardBlocks();

                this.blocks.set(blocks.mainBlocks);

                this.hasMainBlocks = CoreBlockDelegate.hasSupportedBlock(blocks.mainBlocks);
                this.hasSideBlocks = CoreBlockDelegate.hasSupportedBlock(blocks.sideBlocks);

                // -------- SYNCOLOGY: Load Children ------- //
                this.getChildren();
                // ------------- SYNCOLOGY: end ------------//
            } catch (error) {
                CoreAlerts.showError(error);

                // Cannot get the blocks, just show dashboard if needed.
                this.loadFallbackBlocks();
            }
        } else if (!available) {
            // Not available, but not disabled either. Use fallback.
            this.loadFallbackBlocks();
        } else {
            // Disabled.
            this.blocks.set([]);
        }

        this.loaded = true;

        this.logView();
    }

    /**
     * Load fallback blocks to shown before 3.6 when dashboard blocks are not supported.
     */
    protected loadFallbackBlocks(): void {
        this.blocks.set(CORE_BLOCKS_DASHBOARD_FALLBACK_BLOCKS.map((blockName) => ({
            name: blockName,
            visible: true,
        })));

        this.hasMainBlocks = CORE_BLOCKS_DASHBOARD_FALLBACK_BLOCKS.some((blockName) =>
            CoreBlockDelegate.isBlockSupported(blockName));
    }

    /**
     * Refresh the dashboard data.
     *
     * @param refresher Refresher.
     */
    refreshDashboard(refresher: HTMLIonRefresherElement): void {
        const promises: Promise<void>[] = [];

        promises.push(CoreCoursesDashboard.invalidateDashboardBlocks());

        // Invalidate the blocks.
        this.blocksComponents()?.forEach((blockComponent) => {
            promises.push(blockComponent.invalidate());
        });

        CorePromiseUtils.allPromisesIgnoringErrors(promises).finally(() => {
            this.loadContent().finally(async () => {
                await CorePromiseUtils.allPromisesIgnoringErrors(
                    this.blocksComponents()?.map((blockComponent) =>
                        blockComponent.reload()),
                );

                refresher?.complete();
            });
        });
    }

    /**
     * Go to search courses.
     */
    async openSearch(): Promise<void> {
        CoreNavigator.navigateToSitePath('/courses/list', { params : { mode: 'search' } });
    }

    /**
     * @inheritdoc
     */
    ngOnDestroy(): void {
        this.updateSiteObserver.off();
    }

}
