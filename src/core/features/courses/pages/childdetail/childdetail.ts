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
import { Component, OnInit } from '@angular/core';
import { CoreNavigator } from '@services/navigator';
import { CoreCourseHelper } from '@features/course/services/course-helper';
import { Child } from '@features/courses/services/child-courses';
import { CoreCourseBlock } from '@features/course/services/course';
import { CoreBlockDelegate } from '@features/block/services/block-delegate';
import { CoreCoursesDashboard } from '@features/courses/services/dashboard';
import { CoreAlerts } from '@services/overlays/alerts';
import { CoreSharedModule } from '@/core/shared.module';
import { CoreBlockComponent } from '@features/block/components/block/block';

/**
 * Page that displays the child detail page.
 */
@Component({
    selector: 'page-core-child-detail',
    templateUrl: 'childdetail.html',
    styleUrls: ['childdetail.scss'],
    imports: [
        CoreSharedModule,
        CoreBlockComponent,
    ],
})
export default class ChilddetailPage implements OnInit {

    child!: Child;
    courses: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    block: Partial<CoreCourseBlock> = {
        name: 'myoverview',
        visible: true,
    };

    hasMainBlocks = false;
    loaded = false;

    constructor() {
        this.child = CoreNavigator.getRouteParam('child') as Child;
    }

    /**
     * Load fallback blocks to shown before 3.6 when dashboard blocks are not supported.
     */
    protected loadFallbackBlocks(): void {
        this.block = {
            name: 'myoverview',
            visible: true,
        };

        this.hasMainBlocks = CoreBlockDelegate.isBlockSupported('myoverview');
    }

    /**
     * Convenience function to fetch the dashboard data.
     *
     * @returns Promise resolved when done.
     */
    protected async loadContent(): Promise<void> {
        const available = await CoreCoursesDashboard.isAvailable();
        const disabled = await CoreCoursesDashboard.isDisabled();

        if (available && !disabled) {
            try {
                const blocks = await CoreCoursesDashboard.getDashboardBlocks();

                const foundBlock = blocks.mainBlocks?.find((block: CoreCourseBlock) => block.name === 'myoverview');
                if (foundBlock) {
                    this.block = foundBlock;
                }

                this.hasMainBlocks = CoreBlockDelegate.hasSupportedBlock(blocks.mainBlocks);

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
            this.block = {
                name: 'myoverview',
                visible: true,
            };
        }

        this.loaded = true;
    }

    /**
     * @inheritdoc
     */
    ngOnInit(): void {
        this.loadContent();
    }

    /**
     * Open a course.
     *
     * @param course The course to open.
     */
    openCourse(course: any): void { // eslint-disable-line @typescript-eslint/no-explicit-any
        const pageParams: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
            sectionId: 10,
        };
        CoreCourseHelper.openCourse(course, pageParams);
    }

    /**
     * Go back.
     */
    goBack(): void {
        CoreNavigator.back();
    }

}
