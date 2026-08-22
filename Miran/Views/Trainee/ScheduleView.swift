//
//  ScheduleView.swift
//  Miran
//
//  جدول الروتيشنات والشفتات الخاص بالمتدرب — مبني على ScheduleBuilderView (Read-Only).
//

import SwiftUI

struct ScheduleView: View {
    var body: some View {
        ScheduleBuilderView(isReadOnly: true)
    }
}
