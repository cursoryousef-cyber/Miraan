//
//  OrgManagerDashboardFullView.swift
//  Miran
//
//  Dedicated Dashboard Interface for Organization & Health Cluster Managers.
//  Phase 2: metrics are wired to real Backend data (no mock numbers):
//  - /organizations/statistics            → الإحصاءات العامة للتجمع
//  - /organizations/hospitals-cards       → بطاقات المستشفيات التابعة
//  - /timeline/dashboard?scope=cluster    → ملخص الخطوط الزمنية
//  - /training-requests                   → الطلبات الواردة + عداد قيد المعالجة
//

import SwiftUI

// MARK: - لوحة قيادة التجمع (Org Manager / Training Director)
struct OrgManagerDashboardFullView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var colorScheme
    @State private var showCreateRequestSheet = false

    var body: some View {
        SharedDashboardShell(
            roleTitle: "إدارة التجمع الصحي والتوزيع",
            subtitle: "التوزيع التلقائي للمتدربين، اعتماد الطلبات الواردة، والطاقة الاستيعابية للمستشفيات",
            iconName: "building.2.crop.circle.fill",
            accentColor: MiranTheme.emerald
        ) {
            VStack(spacing: 20) {
                // 1. Cluster Metrics Grid — Real API Data Only
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    SharedKPICard(
                        title: "المتدربين بالجهة",
                        value: dashCount(store.organizationStatistics?.totalTrainees),
                        subtitle: "إجمالي المتدربين المسجلين والتراخيص",
                        iconName: "person.3.fill",
                        color: MiranTheme.emerald
                    )

                    SharedKPICard(
                        title: "المدربين المعتمدين",
                        value: dashCount(store.organizationStatistics?.totalTrainers),
                        subtitle: "الكادر التدريبي السريري",
                        iconName: "stethoscope",
                        color: .blue
                    )

                    SharedKPICard(
                        title: "طلبات التدريب الواردة",
                        value: "\(store.pendingTrainingRequestsCount)",
                        subtitle: "طلبات تنتظر التوزيع والاعتماد",
                        iconName: "clock.badge.exclamationmark",
                        color: store.pendingTrainingRequestsCount > 0 ? MiranTheme.warning : MiranTheme.secondaryText(for: colorScheme)
                    )

                    SharedKPICard(
                        title: "المستشفيات التابعة",
                        value: dashCount(store.organizationStatistics?.hospitals),
                        subtitle: "المراكز الميدانية والتأهيلية",
                        iconName: "building.2.fill",
                        color: .orange
                    )
                }
                .padding(.horizontal)

                // 2. Error Banner if stats fail
                if let err = store.clusterStatsError, store.organizationStatistics == nil {
                    DashboardErrorBanner(message: err) {
                        Task { await store.fetchClusterDashboard() }
                    }
                    .padding(.horizontal)
                }

                // 3. Quick Actions Section (Authorized Role Capabilities Only)
                SharedSectionCard(title: "إجراءات التجمع والاعتماد", iconName: "bolt.fill") {
                    VStack(spacing: 10) {
                        NavigationLink(destination: IncomingTrainingRequestsView()) {
                            SharedQuickActionButton(
                                title: "طلبات التدريب الواردة والتوزيع الآلي",
                                subtitle: "مراجعة واعتماد وتوزيع الطلبات القادمة من الجامعات",
                                iconName: "envelope.open.badge.clock",
                                color: MiranTheme.emerald
                            ) {}
                        }
                        .buttonStyle(PlainButtonStyle())

                        SharedQuickActionButton(
                            title: "إنشاء طلب تدريب جديد للمستشفى",
                            subtitle: "إرسال طلب تدريب مباشر للمستشفيات التابعة ضمن نطاقك",
                            iconName: "plus.circle.fill",
                            color: MiranTheme.primary
                        ) {
                            showCreateRequestSheet = true
                        }

                        NavigationLink(destination: OrgMembersView()) {
                            SharedQuickActionButton(
                                title: "أعضاء التجمع الصحي والجهات المعتمدة",
                                subtitle: "إدارة المدربين والمتدربين المسندين للتجمع",
                                iconName: "person.crop.rectangle.stack.fill",
                                color: .purple
                            ) {}
                        }
                        .buttonStyle(PlainButtonStyle())
                    }
                }

                // 4. Hospital Cards Capacity Section
                if !store.hospitalCards.isEmpty {
                    SharedSectionCard(
                        title: "الطاقة الاستيعابية للمستشفيات التابعة",
                        iconName: "building.2.fill",
                        badgeText: "\(store.hospitalCards.count) مستشفى"
                    ) {
                        VStack(spacing: 10) {
                            ForEach(store.hospitalCards) { card in
                                HospitalCardRow(card: card)
                            }
                        }
                    }
                }
            }
        }
        .task {
            await store.fetchClusterDashboard()
            await store.fetchTrainingRequests()
        }
        .refreshable {
            await store.fetchClusterDashboard()
            await store.fetchTrainingRequests()
        }
        .sheet(isPresented: $showCreateRequestSheet) {
            CreateTrainingRequestSheet()
        }
    }

    // MARK: - Helpers (قيم حقيقية فقط — "—" أثناء التحميل)

    private func dashCount(_ value: Int?) -> String {
        value.map(String.init) ?? "—"
    }

    /// مجموع المشرفين من بطاقات المستشفيات (المصدر: /organizations/hospitals-cards)
    private var supervisorSum: Int? {
        guard !store.hospitalCards.isEmpty else { return nil }
        return store.hospitalCards.reduce(0) { $0 + $1.supervisorCount }
    }

    /// معدل إنجاز الروتيشنات من ملخص الخط الزمني للتجمع
    private var timelinePercent: String {
        guard let t = store.clusterTimeline else { return "—" }
        return "\(Int(t.averageCompletion))%"
    }
}

// MARK: - Banner خطأ لوحة القيادة
struct DashboardErrorBanner: View {
    let message: String
    let retry: () -> Void
    @Environment(\.colorScheme) var scheme

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(MiranTheme.warning)
            Text(message)
                .font(.caption)
                .foregroundColor(MiranTheme.textPrimary)
                .lineLimit(2)
            Spacer()
            Button("إعادة المحاولة", action: retry)
                .font(.caption.bold())
                .foregroundColor(MiranTheme.warning)
        }
        .padding(12)
        .background(MiranTheme.surface(for: scheme))
        .cornerRadius(12)
    }
}

// MARK: - صف بطاقة مستشفى (قدرة استيعابية حقيقية)
struct HospitalCardRow: View {
    let card: HospitalCardModel
    @Environment(\.colorScheme) var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(card.nameAr)
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    Text("\(card.code) · \(card.cityAr ?? "")")
                        .font(.caption2)
                        .foregroundColor(MiranTheme.subtext)
                }
                Spacer()
                Text(occupancyText)
                    .font(.subheadline.bold())
                    .foregroundColor(occupancyColor)
            }
            HStack(spacing: 14) {
                Label("\(card.occupied)/\(card.capacity)", systemImage: "bed.double.fill")
                    .font(.caption)
                    .foregroundColor(MiranTheme.subtext)
                Label("\(card.departmentsCount) قسم", systemImage: "building.2")
                    .font(.caption)
                    .foregroundColor(MiranTheme.subtext)
                Label("\(card.trainerCount) مدرب", systemImage: "stethoscope")
                    .font(.caption)
                    .foregroundColor(MiranTheme.subtext)
                Spacer()
            }
            // شريط الإشغال
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.1))
                    Capsule()
                        .fill(occupancyColor)
                        .frame(width: max(6, geo.size.width * occupancyRatio))
                }
            }
            .frame(height: 6)
        }
        .padding()
        .background(MiranTheme.surface(for: scheme))
        .cornerRadius(14)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(MiranTheme.border(for: scheme), lineWidth: 1)
        )
    }

    private var occupancyRatio: CGFloat {
        guard card.capacity > 0 else { return 0 }
        return CGFloat(Double(card.occupied) / Double(card.capacity)).clamped(to: 0...1)
    }

    private var occupancyText: String {
        let pct = card.occupancyPercentage ?? (card.capacity > 0 ? Double(card.occupied) / Double(card.capacity) * 100 : 0)
        return "\(Int(pct))%"
    }

    private var occupancyColor: Color {
        let pct = card.occupancyPercentage ?? 0
        if pct >= 90 { return MiranTheme.error }
        if pct >= 70 { return MiranTheme.warning }
        return MiranTheme.success
    }
}

extension CGFloat {
    func clamped(to range: ClosedRange<CGFloat>) -> CGFloat {
        Swift.min(Swift.max(self, range.lowerBound), range.upperBound)
    }
}

// MARK: - طلبات التدريب الواردة (قائمة)

struct IncomingTrainingRequestsView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var searchText = ""
    @State private var filterGroup: TrainingRequestStatus.Group = .all
    @State private var showCreateSheet = false

    var body: some View {
        ZStack {
            MiranTheme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                filterBar
                    .padding(.horizontal)
                    .padding(.vertical, 10)

                if store.trainingRequestsLoading && !store.trainingRequestsLoaded {
                    Spacer()
                    ProgressView("جاري تحميل الطلبات الواردة…")
                        .foregroundColor(.white)
                    Spacer()
                } else if let err = store.trainingRequestsError, !store.trainingRequestsLoaded {
                    Spacer()
                    RequestLoadErrorView(message: err) {
                        Task { await store.fetchTrainingRequests() }
                    }
                    Spacer()
                } else if filteredRequests.isEmpty {
                    Spacer()
                    RequestEmptyState(hasFilters: !searchText.isEmpty || filterGroup != .all) {
                        searchText = ""
                        filterGroup = .all
                    }
                    Spacer()
                } else {
                    List {
                        ForEach(filteredRequests) { request in
                            NavigationLink(destination: TrainingRequestDetailView(requestID: request.id)) {
                                TrainingRequestRowView(request: request)
                            }
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .background(Color.clear)
                }
            }
        }
        .navigationTitle("طلبات التدريب")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showCreateSheet = true
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .foregroundColor(MiranTheme.emerald)
                }
            }
        }
        .sheet(isPresented: $showCreateSheet) {
            CreateTrainingRequestSheet()
        }
        .task {
            await store.fetchTrainingRequests()
        }
    }

    // MARK: شريط الفلترة والبحث

    private var filterBar: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(MiranTheme.subtext)
                TextField("بحث برقم الطلب، الجهة، أو التخصص…", text: $searchText)
                    .foregroundColor(.white)
                    .autocorrectionDisabled()
                if !searchText.isEmpty {
                    Button { searchText = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(MiranTheme.subtext)
                    }
                }
            }
            .padding(10)
            .background(MiranTheme.cardBg)
            .cornerRadius(12)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(TrainingRequestStatus.Group.allCases) { group in
                        Button {
                            filterGroup = group
                        } label: {
                            Text(group.rawValue)
                                .font(.caption.bold())
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(filterGroup == group ? MiranTheme.primary.opacity(0.2) : Color.clear)
                                .foregroundColor(filterGroup == group ? MiranTheme.primary : MiranTheme.subtext)
                                .cornerRadius(10)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(filterGroup == group ? MiranTheme.primary.opacity(0.5) : MiranTheme.border(for: .dark), lineWidth: 1)
                                )
                        }
                    }
                }
            }
        }
    }

    private var filteredRequests: [TrainingRequestItem] {
        var items = store.trainingRequests

        if filterGroup != .all {
            items = items.filter { $0.requestStatus.group == filterGroup }
        }

        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            items = items.filter { request in
                request.displayRequestNumber.localizedCaseInsensitiveContains(trimmed)
                || (request.sourceOrg?.nameAr ?? "").contains(trimmed)
                || (request.targetOrg?.nameAr ?? "").contains(trimmed)
                || (request.specialty ?? "").contains(trimmed)
                || (request.program?.nameAr ?? "").contains(trimmed)
            }
        }

        return items.sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
    }
}

// MARK: - حالات القائمة: خطأ / فارغ

struct RequestLoadErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 40))
                .foregroundColor(MiranTheme.warning)
            Text("تعذر تحميل الطلبات")
                .font(.headline.bold())
                .foregroundColor(.white)
            Text(message)
                .font(.caption)
                .foregroundColor(MiranTheme.subtext)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("إعادة المحاولة", action: retry)
                .font(.subheadline.bold())
                .foregroundColor(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 10)
                .background(MiranTheme.primary)
                .cornerRadius(10)
        }
    }
}

struct RequestEmptyState: View {
    let hasFilters: Bool
    let clearFilters: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: hasFilters ? "line.3.horizontal.decrease.circle" : "tray")
                .font(.system(size: 40))
                .foregroundColor(MiranTheme.subtext)
            Text(hasFilters ? "لا توجد نتائج مطابقة للفلترة" : "لا توجد طلبات تدريب واردة حالياً")
                .font(.headline.bold())
                .foregroundColor(.white)
            if hasFilters {
                Button("مسح الفلاتر", action: clearFilters)
                    .font(.subheadline.bold())
                    .foregroundColor(MiranTheme.primary)
            }
        }
    }
}

// MARK: - صف طلب تدريب

struct TrainingRequestRowView: View {
    let request: TrainingRequestItem
    @Environment(\.colorScheme) var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(request.displayRequestNumber)
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
                Spacer()
                TrainingRequestStatusChip(status: request.requestStatus)
            }

            HStack(spacing: 6) {
                Image(systemName: "arrow.right.circle.fill")
                    .font(.caption)
                    .foregroundColor(MiranTheme.emerald)
                Text(request.sourceOrg?.nameAr ?? "جامعة")
                    .font(.caption.bold())
                    .foregroundColor(MiranTheme.subtext)
                Image(systemName: "arrow.left")
                    .font(.caption2)
                    .foregroundColor(MiranTheme.subtext)
                Text(request.targetOrg?.nameAr ?? "تجمع")
                    .font(.caption.bold())
                    .foregroundColor(MiranTheme.subtext)
            }

            HStack(spacing: 14) {
                Label("\(request.count) متدرب", systemImage: "person.3")
                    .font(.caption)
                    .foregroundColor(MiranTheme.subtext)
                if let prog = request.program?.nameAr, !prog.isEmpty {
                    Label(prog, systemImage: "list.clipboard")
                        .font(.caption)
                        .foregroundColor(MiranTheme.subtext)
                        .lineLimit(1)
                }
                if let spec = request.specialty, !spec.isEmpty {
                    Label(spec, systemImage: "stethoscope")
                        .font(.caption)
                        .foregroundColor(MiranTheme.subtext)
                        .lineLimit(1)
                }
                Spacer()
            }
        }
        .padding()
        .background(MiranTheme.surface(for: scheme))
        .cornerRadius(14)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(MiranTheme.border(for: scheme), lineWidth: 1)
        )
    }
}

// MARK: - شارة الحالة

struct TrainingRequestStatusChip: View {
    let status: TrainingRequestStatus

    var body: some View {
        Text(status.arabicLabel)
            .font(.caption2.bold())
            .foregroundColor(status.statusColor)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(status.statusColor.opacity(0.15))
            .cornerRadius(8)
    }
}

extension TrainingRequestStatus {
    /// لون الحالة في الواجهة (ألوان دلالية: تحذير/نجاح/خطأ…)
    var statusColor: Color {
        switch self {
        case .draft: return MiranTheme.subtext
        case .submitted: return MiranTheme.warning
        case .underClusterReview, .resubmitted: return MiranTheme.accent
        case .returnedToUniversity: return MiranTheme.warning
        case .rejected: return MiranTheme.error
        case .autoAllocated, .allocated, .manuallyReallocated: return MiranTheme.teal
        case .approved: return MiranTheme.success
        case .active, .graduated: return MiranTheme.emerald
        default: return MiranTheme.subtext
        }
    }
}

// MARK: - تفاصيل طلب تدريب

struct TrainingRequestDetailView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var authViewModel: AuthViewModel
    let requestID: String

    /// إجراءات تتطلب تأكيداً فقط (موافقة / توزيع تلقائي)
    @State private var confirmAction: ClusterRequestAction?
    /// إجراءات تتطلب إدخال نص (رفض / إعادة للجامعة)
    @State private var textAction: ClusterRequestAction?
    @State private var reasonText = ""
    @State private var activeAlert: DetailAlert?
    @State private var isPerforming = false

    private var request: TrainingRequestItem? { store.trainingRequestDetail }

    var body: some View {
        ZStack {
            MiranTheme.background.ignoresSafeArea()

            if store.requestDetailLoading && request == nil {
                ProgressView("جاري تحميل تفاصيل الطلب…")
                    .foregroundColor(.white)
            } else if let err = store.requestDetailError, request == nil {
                RequestLoadErrorView(message: err) {
                    Task { await store.fetchTrainingRequestDetail(id: requestID) }
                }
            } else if let request {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        headerCard(request)
                        infoCard(request)
                        RequestLifecycleTimelineView(request: request)
                        TrainingRequestAllocationsSection(allocations: request.allocations ?? [])
                        TrainingRequestTraineesSection(requestID: requestID)
                        if actionsPolicy(for: request).hasAnyAction {
                            TrainingRequestActionsSection(policy: actionsPolicy(for: request)) { action in
                                if action.needsTextInput {
                                    textAction = action
                                } else {
                                    confirmAction = action
                                }
                            }
                        }
                        footerDates(request)
                    }
                    .padding()
                }
                .overlay {
                    if isPerforming {
                        ZStack {
                            Color.black.opacity(0.4).ignoresSafeArea()
                            ProgressView("جاري تنفيذ الإجراء…")
                                .padding(20)
                                .background(MiranTheme.cardBg)
                                .cornerRadius(14)
                        }
                    }
                }
            }
        }
        .navigationTitle("تفاصيل الطلب")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await store.fetchTrainingRequestDetail(id: requestID)
        }
        .confirmationDialog(actionTitle, isPresented: confirmBinding, titleVisibility: .visible) {
            Button("تأكيد") { if let action = confirmAction { performAction(action) } }
            Button("إلغاء", role: .cancel) {}
        } message: {
            Text(confirmMessage)
        }
        .sheet(item: $textAction) { action in
            ReasonInputSheet(action: action, text: $reasonText) {
                performAction(action)
            }
        }
        .alert(item: $activeAlert) { alert in
            switch alert {
            case .error(let message):
                return Alert(title: Text("تعذر تنفيذ الإجراء"), message: Text(message), dismissButton: .default(Text("حسناً")))
            case .success(let message):
                return Alert(title: Text("تمت العملية"), message: Text(message), dismissButton: .default(Text("حسناً")))
            }
        }
    }

    // MARK: - بوابة الصلاحيات (تعكس سلطة Backend فقط)

    private func actionsPolicy(for request: TrainingRequestItem) -> ClusterRequestActionPolicy {
        let user = authViewModel.currentUser
        return ClusterRequestActionPolicy(
            capabilities: Set(user?.capabilities ?? []),
            roles: Set(user?.roles ?? []),
            status: request.requestStatus
        )
    }

    // MARK: - الأقسام

    private func headerCard(_ request: TrainingRequestItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(request.displayRequestNumber)
                    .font(.title3.bold())
                    .foregroundColor(.white)
                Spacer()
                TrainingRequestStatusChip(status: request.requestStatus)
            }
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("الجهة المرسلة")
                        .font(.caption2)
                        .foregroundColor(MiranTheme.subtext)
                    Text(request.sourceOrg?.nameAr ?? "—")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                }
                Image(systemName: "arrow.left")
                    .foregroundColor(MiranTheme.subtext)
                VStack(alignment: .leading, spacing: 2) {
                    Text("الجهة المستقبلة")
                        .font(.caption2)
                        .foregroundColor(MiranTheme.subtext)
                    Text(request.targetOrg?.nameAr ?? "—")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                }
                Spacer()
            }
        }
        .padding()
        .background(MiranTheme.cardBg)
        .cornerRadius(16)
    }

    private func infoCard(_ request: TrainingRequestItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("بيانات الطلب")
                .font(.headline.bold())
                .foregroundColor(.white)

            InfoRow(label: "البرنامج التدريبي", value: request.program?.nameAr ?? "—")
            InfoRow(label: "التخصص", value: request.specialty ?? "—")
            InfoRow(label: "عدد المتدربين", value: "\(request.studentCount)")
            InfoRow(label: "الأولوية", value: priorityLabel(request.priority))
            InfoRow(label: "تاريخ بدء التدريب", value: displayDate(request.trainingStartDate) ?? "—")
            InfoRow(label: "تاريخ انتهاء التدريب", value: displayDate(request.trainingEndDate) ?? "—")
            if let text = request.notesPayload?.text, !text.isEmpty {
                InfoRow(label: "نص الطلب", value: text)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MiranTheme.cardBg)
        .cornerRadius(16)
    }

    private func footerDates(_ request: TrainingRequestItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("آخر تحديث: \(displayDate(request.updatedAt) ?? "—")")
                .font(.caption2)
                .foregroundColor(MiranTheme.subtext)
            Text("تاريخ الإنشاء: \(displayDate(request.createdAt) ?? "—")")
                .font(.caption2)
                .foregroundColor(MiranTheme.subtext)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - الإجراءات

    private var confirmBinding: Binding<Bool> {
        Binding(
            get: { confirmAction != nil },
            set: { if !$0 { confirmAction = nil } }
        )
    }

    private var actionTitle: String {
        confirmAction?.confirmTitle ?? ""
    }

    private var confirmMessage: String {
        confirmAction?.confirmMessage ?? ""
    }

    /// تنفيذ الإجراء عبر Backend — الأخطاء تُعرض وليس تُبتلع.
    private func performAction(_ action: ClusterRequestAction) {
        isPerforming = true
        Task {
            do {
                switch action.kind {
                case .approve:
                    try await store.approveTrainingRequest(id: requestID)
                case .reject:
                    try await store.rejectTrainingRequest(id: requestID, reason: reasonText)
                case .returnToUniversity:
                    try await store.returnTrainingRequestToUniversity(id: requestID, notes: reasonText)
                case .autoAllocate:
                    try await store.autoAllocateTrainingRequest(id: requestID)
                }
                reasonText = ""
                if let msg = store.requestActionResultMessage {
                    activeAlert = .success(msg)
                    store.requestActionResultMessage = nil
                }
            } catch {
                activeAlert = .error(error.localizedDescription)
            }
            isPerforming = false
        }
    }
}

// MARK: - Alert موحّد لشاشة التفاصيل
private enum DetailAlert: Identifiable {
    case error(String)
    case success(String)

    var id: String {
        switch self {
        case .error(let m): return "error-\(m)"
        case .success(let m): return "success-\(m)"
        }
    }
}

// MARK: - إجراءات الطلب

struct ClusterRequestAction: Identifiable, Equatable {
    let id = UUID()
    let kind: Kind
    let label: String
    let icon: String
    let color: Color

    enum Kind: String {
        case approve, reject, returnToUniversity, autoAllocate
    }

    var needsTextInput: Bool { kind == .reject || kind == .returnToUniversity }

    var confirmTitle: String {
        switch kind {
        case .approve: return "تأكيد الموافقة النهائية"
        case .reject: return "تأكيد رفض الطلب"
        case .returnToUniversity: return "تأكيد إعادة الطلب للجامعة"
        case .autoAllocate: return "تأكيد التوزيع التلقائي"
        }
    }

    var confirmMessage: String {
        switch kind {
        case .approve: return "سيتم اعتماد توزيع طلب التدريب نهائياً. لا يمكن التراجع بعد الاعتماد."
        case .reject: return "سيتم رفض طلب التدريب نهائياً."
        case .returnToUniversity: return "سيتم إعادة الطلب للجامعة لمراجعته وتعديله."
        case .autoAllocate: return "سيتم توزيع المتدربين تلقائياً على المستشفيات حسب الطاقة الاستيعابية."
        }
    }
}

struct TrainingRequestActionsSection: View {
    let policy: ClusterRequestActionPolicy
    let onSelect: (ClusterRequestAction) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("الإجراءات المتاحة")
                .font(.headline.bold())
                .foregroundColor(.white)

            VStack(spacing: 8) {
                if policy.canApprove {
                    RequestActionButton(
                        action: ClusterRequestAction(kind: .approve, label: "الموافقة النهائية", icon: "checkmark.seal.fill", color: MiranTheme.success),
                        onSelect: onSelect
                    )
                }
                if policy.canAutoAllocate {
                    RequestActionButton(
                        action: ClusterRequestAction(kind: .autoAllocate, label: "التوزيع التلقائي", icon: "wand.and.stars", color: MiranTheme.teal),
                        onSelect: onSelect
                    )
                }
                if policy.canReturnToUniversity {
                    RequestActionButton(
                        action: ClusterRequestAction(kind: .returnToUniversity, label: "إعادة الطلب للجامعة", icon: "arrow.uturn.backward.circle", color: MiranTheme.warning),
                        onSelect: onSelect
                    )
                }
                if policy.canReject {
                    RequestActionButton(
                        action: ClusterRequestAction(kind: .reject, label: "رفض الطلب", icon: "xmark.octagon.fill", color: MiranTheme.error),
                        onSelect: onSelect
                    )
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MiranTheme.cardBg)
        .cornerRadius(16)
    }
}

struct RequestActionButton: View {
    let action: ClusterRequestAction
    let onSelect: (ClusterRequestAction) -> Void

    var body: some View {
        Button {
            onSelect(action)
        } label: {
            HStack {
                Image(systemName: action.icon)
                    .foregroundColor(action.color)
                Text(action.label)
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
                Spacer()
                Image(systemName: "chevron.left")
                    .font(.caption)
                    .foregroundColor(MiranTheme.subtext)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .background(action.color.opacity(0.12))
            .cornerRadius(12)
        }
    }
}

// MARK: - نافذة إدخال السبب/الملاحظات

struct ReasonInputSheet: View {
    let action: ClusterRequestAction
    @Binding var text: String
    let confirm: () -> Void
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            VStack(alignment: .leading, spacing: 16) {
                Text(action.kind == .reject ? "سبب الرفض (إلزامي)" : "ملاحظات الإعادة للجامعة")
                    .font(.headline.bold())
                    .foregroundColor(.white)
                TextEditor(text: $text)
                    .frame(minHeight: 120)
                    .padding(8)
                    .background(MiranTheme.cardBg)
                    .cornerRadius(12)
                    .foregroundColor(.white)
                Spacer()
            }
            .padding()
            .background(MiranTheme.background.ignoresSafeArea())
            .navigationTitle(action.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("تنفيذ") {
                        dismiss()
                        confirm()
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

// MARK: - الخط الزمني للحياة (من الحالة الفعلية وبيانات Backend)

struct RequestLifecycleTimelineView: View {
    let request: TrainingRequestItem
    @Environment(\.colorScheme) var scheme

    private enum StepState {
        case done, current, upcoming, blocked
    }

    private struct Step: Identifiable {
        let id: Int
        let titleAr: String
        let state: StepState
        let dateText: String?
    }

    private var steps: [Step] {
        let status = request.requestStatus
        let created = displayDate(request.createdAt)
        let updated = displayDate(request.updatedAt)

        var result: [Step] = []

        // 1) استلام الطلب
        result.append(Step(id: 1, titleAr: "استلام الطلب من الجامعة", state: .done, dateText: created))

        if status == .draft {
            result.append(Step(id: 2, titleAr: "المراجعة والاعتماد", state: .upcoming, dateText: nil))
        } else if status == .rejected {
            result.append(Step(id: 2, titleAr: "رفض الطلب", state: .blocked, dateText: updated))
        } else if status == .returnedToUniversity {
            result.append(Step(id: 2, titleAr: "إعادة الطلب للجامعة للتعديل", state: .blocked, dateText: updated))
        } else if status == .submitted {
            result.append(Step(id: 2, titleAr: "مراجعة التجمع", state: .current, dateText: updated))
        } else {
            // متقدم عن الإرسال: المراجعة مكتملة
            result.append(Step(id: 2, titleAr: "مراجعة التجمع", state: .done, dateText: updated))
        }

        // 3) التوزيع
        if status.isProcessing && status != .submitted && status != .underClusterReview && status != .returnedToUniversity && status != .rejected {
            result.append(Step(id: 3, titleAr: "التوزيع على المستشفيات", state: .current, dateText: nil))
        } else if status.canBeApproved && status != .submitted && status != .underClusterReview {
            result.append(Step(id: 3, titleAr: "التوزيع على المستشفيات", state: .done, dateText: nil))
        } else if !status.isProcessing && status != .draft && status != .returnedToUniversity && status != .rejected {
            result.append(Step(id: 3, titleAr: "التوزيع على المستشفيات", state: .done, dateText: nil))
        }

        // 4) الاعتماد النهائي
        if status == .approved || status.isInAcceptanceChain {
            result.append(Step(id: 4, titleAr: "الاعتماد النهائي", state: .done, dateText: nil))
        } else if status.canBeApproved {
            result.append(Step(id: 4, titleAr: "الاعتماد النهائي", state: .current, dateText: nil))
        } else if !status.isFinal && status != .draft && status != .returnedToUniversity && status != .submitted && status != .underClusterReview {
            result.append(Step(id: 4, titleAr: "الاعتماد النهائي", state: .done, dateText: nil))
        }

        // 5) التدريب الفعلي
        if status == .active || status == .graduated {
            result.append(Step(id: 5, titleAr: "التدريب الفعلي", state: .done, dateText: nil))
        } else if status.isInAcceptanceChain {
            result.append(Step(id: 5, titleAr: "التدريب الفعلي", state: .current, dateText: nil))
        }

        // 6) التخرج
        if status == .graduated {
            result.append(Step(id: 6, titleAr: "التخرج", state: .done, dateText: nil))
        }

        return result
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("مسار حياة الطلب (حسب الحالة الفعلية)", systemImage: "clock.arrow.circlepath")
                .font(.headline.bold())
                .foregroundColor(.white)

            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                    HStack(alignment: .top, spacing: 14) {
                        VStack(spacing: 0) {
                            Circle()
                                .fill(stepCircleColor(step.state))
                                .frame(width: 14, height: 14)
                                .overlay(Circle().stroke(Color.white, lineWidth: 1.5))
                            if index < steps.count - 1 {
                                Rectangle()
                                    .fill(MiranTheme.emerald.opacity(0.35))
                                    .frame(width: 2, height: 40)
                            }
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            Text(step.titleAr)
                                .font(.caption.bold())
                                .foregroundColor(step.state == .blocked ? MiranTheme.error : MiranTheme.textPrimary)
                            if let dateText = step.dateText {
                                Text(dateText)
                                    .font(.caption2)
                                    .foregroundColor(MiranTheme.subtext)
                            }
                        }
                        .padding(.bottom, index < steps.count - 1 ? 12 : 0)
                        Spacer()
                    }
                }
            }
            .padding()
            .background(MiranTheme.surface(for: scheme))
            .cornerRadius(14)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MiranTheme.cardBg)
        .cornerRadius(16)
    }

    private func stepCircleColor(_ state: StepState) -> Color {
        switch state {
        case .done: return MiranTheme.success
        case .current: return MiranTheme.warning
        case .upcoming: return MiranTheme.subtext.opacity(0.4)
        case .blocked: return MiranTheme.error
        }
    }
}

extension TrainingRequestStatus {
    /// هل الطلب في سلسلة قبول المستشفى (بعد الاعتماد)؟
    var isInAcceptanceChain: Bool {
        switch self {
        case .hospitalAccepted, .hospitalAdministratorAccepted, .supervisorAccepted,
             .trainingSupervisorAccepted, .trainerAccepted:
            return true
        default:
            return false
        }
    }
}

// MARK: - توزيع الطلب على المستشفيات

struct TrainingRequestAllocationsSection: View {
    let allocations: [TrainingRequestAllocation]
    @Environment(\.colorScheme) var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("توزيع المقاعد على المستشفيات")
                .font(.headline.bold())
                .foregroundColor(.white)

            if allocations.isEmpty {
                Text("لم يُنفَّذ التوزيع بعد على هذا الطلب.")
                    .font(.caption)
                    .foregroundColor(MiranTheme.subtext)
            } else {
                ForEach(allocations) { alloc in
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(alloc.hospitalName ?? alloc.hospitalCode ?? "مستشفى")
                                .font(.subheadline.bold())
                                .foregroundColor(.white)
                            if let reason = alloc.reason {
                                Text(reason)
                                    .font(.caption2)
                                    .foregroundColor(MiranTheme.subtext)
                            }
                        }
                        Spacer()
                        Text(allocatedText(alloc))
                            .font(.subheadline.bold())
                            .foregroundColor(MiranTheme.success)
                    }
                    .padding(10)
                    .background(MiranTheme.surface(for: scheme))
                    .cornerRadius(12)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MiranTheme.cardBg)
        .cornerRadius(16)
    }

    private func allocatedText(_ alloc: TrainingRequestAllocation) -> String {
        if let seats = alloc.allocatedSeats { return "\(seats) مقعد" }
        if let allocated = alloc.allocated { return allocated ? "مُوزَّع" : "بدون توزيع" }
        return "—"
    }
}

// MARK: - صفوف المتدربين داخل الدفعة

struct TrainingRequestTraineesSection: View {
    @EnvironmentObject var store: AppStore
    let requestID: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("صفوف المتدربين")
                    .font(.headline.bold())
                    .foregroundColor(.white)
                Spacer()
                if store.requestTraineesLoading {
                    ProgressView().controlSize(.small)
                }
            }

            if store.requestTraineesLoading && !store.requestTraineesLoaded {
                Text("جاري تحميل صفوف المتدربين…")
                    .font(.caption)
                    .foregroundColor(MiranTheme.subtext)
            } else if let err = store.requestTraineesError, !store.requestTraineesLoaded {
                HStack {
                    Text("تعذر تحميل الصفوف")
                        .font(.caption)
                        .foregroundColor(MiranTheme.error)
                    Spacer()
                    Button("إعادة المحاولة") {
                        Task { await store.fetchRequestTrainees(id: requestID) }
                    }
                    .font(.caption.bold())
                    .foregroundColor(MiranTheme.warning)
                }
            } else if store.requestTrainees.isEmpty {
                Text("لا توجد صفوف متدربين مضافة على هذا الطلب بعد.")
                    .font(.caption)
                    .foregroundColor(MiranTheme.subtext)
            } else {
                VStack(spacing: 8) {
                    ForEach(store.requestTrainees) { row in
                        TraineeRowCard(row: row)
                    }
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MiranTheme.cardBg)
        .cornerRadius(16)
        .task {
            await store.fetchRequestTrainees(id: requestID)
        }
    }
}

struct TraineeRowCard: View {
    let row: TrainingRequestTraineeRow
    @Environment(\.colorScheme) var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.nameAr ?? "متدرب")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    Text("\(row.academicNumber ?? "—") · \(row.nationalId ?? "—")")
                        .font(.caption2)
                        .foregroundColor(MiranTheme.subtext)
                }
                Spacer()
                TraineeRowStatusChip(status: row.status)
            }

            HStack(spacing: 12) {
                if let specialty = row.specialty, !specialty.isEmpty {
                    Label(specialty, systemImage: "stethoscope")
                        .font(.caption)
                        .foregroundColor(MiranTheme.subtext)
                }
                if let hosp = row.assignedHospital?.nameAr {
                    Label(hosp, systemImage: "building.2.fill")
                        .font(.caption)
                        .foregroundColor(MiranTheme.subtext)
                        .lineLimit(1)
                }
                Spacer()
            }

            // أخطاء التحقق من الجامعة (تُعرض كما أرسلها Backend)
            if let errors = row.validationErrors, !errors.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(errors) { err in
                        Label(err.messageAr ?? "خطأ تحقق", systemImage: "exclamationmark.triangle.fill")
                            .font(.caption2)
                            .foregroundColor(MiranTheme.warning)
                    }
                }
            }
        }
        .padding(10)
        .background(MiranTheme.surface(for: scheme))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(rowHasValidationIssues ? MiranTheme.warning.opacity(0.4) : MiranTheme.border(for: scheme), lineWidth: 1)
        )
    }

    private var rowHasValidationIssues: Bool {
        !(row.validationErrors ?? []).isEmpty
    }
}

struct TraineeRowStatusChip: View {
    let status: String

    private var label: String {
        switch status {
        case "submitted": return "مُرسل"
        case "cluster_reviewed": return "رُوجع"
        case "cluster_approved", "approved": return "معتمد"
        case "allocated": return "مُوزَّع"
        case "hospital_review": return "مراجعة المستشفى"
        case "returned": return "أُعيد للجامعة"
        case "rejected": return "مرفوض"
        case "on_hold": return "معلّق"
        default: return status
        }
    }

    private var color: Color {
        switch status {
        case "submitted": return MiranTheme.warning
        case "allocated", "hospital_review": return MiranTheme.teal
        case "cluster_approved", "approved": return MiranTheme.success
        case "returned": return MiranTheme.warning
        case "rejected": return MiranTheme.error
        default: return MiranTheme.subtext
        }
    }

    var body: some View {
        Text(label)
            .font(.caption2.bold())
            .foregroundColor(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.15))
            .cornerRadius(8)
    }
}

// MARK: - أدوات عامة

private func priorityLabel(_ priority: String?) -> String {
    switch priority {
    case "high": return "عالية"
    case "normal": return "عادية"
    case "low": return "منخفضة"
    default: return priority ?? "—"
    }
}

private func displayDate(_ iso: String?) -> String? {
    guard let iso, !iso.isEmpty else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: iso) {
        let out = DateFormatter()
        out.locale = Locale(identifier: "ar_SA")
        out.dateFormat = "yyyy/MM/dd"
        return out.string(from: date)
    }
    return String(iso.prefix(10))
}

// MARK: - نافذة إضافة طلب تدريب جديد للمستشفى (من مدير التجمع)
struct CreateTrainingRequestSheet: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var systemColorScheme

    @State private var requestMode: String = "batch" // "batch" (Primary Excel Import) or "single" (Helper)
    @State private var specialty = "internal_medicine"
    @State private var studentCountStr = "1"
    @State private var targetHospitalId = ""
    @State private var startDate = Date()
    @State private var endDate = Calendar.current.date(byAdding: .month, value: 3, to: Date()) ?? Date()
    @State private var notes = ""

    // Batch Excel / CSV / JSON Roster Text Input & Preview
    @State private var excelRosterText = ""
    @State private var parsedBatchRows: [CandidateTraineeInputDtoHelper] = []
    @State private var batchValidationErrors: [String] = []

    // Individual Trainee Candidate Fields (Secondary Helper)
    @State private var candidateNameAr = ""
    @State private var candidateNationalId = ""
    @State private var candidateAcademicNumber = ""
    @State private var candidateUniversity = ""
    @State private var candidateMobile = ""
    @State private var candidateEmail = ""
    @State private var internshipLetterUrl = ""

    // PDF Real File Attachment State
    @State private var isSelectingPdf = false
    @State private var isUploadingPdf = false
    @State private var uploadedFileName = ""
    @State private var uploadErrorMsg = ""
    @State private var selectedPdfData: Data? = nil

    @State private var isLoading = false
    @State private var errorMsg = ""

    struct CandidateTraineeInputDtoHelper: Identifiable, Codable {
        var id: String { academicNumber + nationalId }
        let academicNumber: String
        let nationalId: String
        let nameAr: String
        let nameEn: String?
        let gender: String?
        let specialty: String?
        let university: String?
        let email: String?
        let mobile: String?
        let startDate: String?
        let endDate: String?
    }

    var body: some View {
        NavigationView {
            Form {
                Section("نوع تقديم الطلب") {
                    Picker("نمط التقديم", selection: $requestMode) {
                        Text("استيراد كشف الإكسل (أساسي)").tag("batch")
                        Text("متدرب فردي (مساعد)").tag("single")
                    }
                    .pickerStyle(SegmentedPickerStyle())
                }

                Section("تفاصيل الطلب والجهة") {
                    Picker("التخصص الطبي", selection: $specialty) {
                        Text("الباطنة العامة (internal_medicine)").tag("internal_medicine")
                        Text("طب الأطفال (paediatrics)").tag("paediatrics")
                    }

                    Picker("المستشفى المستهدف", selection: $targetHospitalId) {
                        Text("اختر المستشفى...").tag("")
                        ForEach(store.hospitalCards, id: \.id) { hosp in
                            Text(hosp.nameAr).tag(hosp.id)
                        }
                    }
                }

                if requestMode == "batch" {
                    Section("استيراد كشف المتدربين عبر Excel / CSV") {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Image(systemName: "arrow.down.doc.fill")
                                    .foregroundColor(MiranTheme.emerald)
                                Text("قالب Excel المعتمد يحوي الأعمدة التالية:")
                                    .font(.caption.bold())
                                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                            }
                            Text("academicNumber | nationalId | nameAr | nameEn | gender | specialty | university | email | mobile | startDate | endDate")
                                .font(.caption2)
                                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                        }
                        .padding(.vertical, 4)

                        TextEditor(text: $excelRosterText)
                            .frame(height: 110)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                            )
                            .onChange(of: excelRosterText) { newValue in
                                parseAndValidateExcelRoster(newValue)
                            }

                        if !excelRosterText.isEmpty {
                            Button("التحقق من صحة كشف Excel") {
                                parseAndValidateExcelRoster(excelRosterText)
                            }
                            .font(.caption.bold())
                        }
                    }

                    if !parsedBatchRows.isEmpty {
                        Section("معاينة كشف المتدربين المستورد (\(parsedBatchRows.count) متدرب)") {
                            ForEach(parsedBatchRows) { row in
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack {
                                        Text(row.nameAr.isEmpty ? "اسم غير مدخل" : row.nameAr)
                                            .font(.subheadline.bold())
                                        Spacer()
                                        Text(row.academicNumber)
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                    HStack(spacing: 8) {
                                        Text("الهوية: \(row.nationalId)")
                                            .font(.caption2)
                                            .foregroundColor(.secondary)
                                        if let sp = row.specialty {
                                            Text("• \(sp)")
                                                .font(.caption2)
                                                .foregroundColor(MiranTheme.emerald)
                                        }
                                    }
                                }
                                .padding(.vertical, 2)
                            }
                        }
                    }

                    if !batchValidationErrors.isEmpty {
                        Section("تنبيهات التحقق من الكشف") {
                            ForEach(batchValidationErrors, id: \.self) { err in
                                Label(err, systemImage: "exclamationmark.triangle.fill")
                                    .font(.caption)
                                    .foregroundColor(.orange)
                            }
                        }
                    }
                }

                if requestMode == "single" {
                    Section("بيانات المتدرب الفردية (إدخال مساعد)") {
                        TextField("الاسم الكامل بالعربية", text: $candidateNameAr)
                        TextField("رقم الهوية الوطنية (10 أرقام)", text: $candidateNationalId)
                            .keyboardType(.numberPad)
                        TextField("الرقم الأكاديمي (الجامعي)", text: $candidateAcademicNumber)
                        TextField("الجامعة / الجهة التعليمية", text: $candidateUniversity)
                        TextField("رقم الجوال", text: $candidateMobile)
                            .keyboardType(.phonePad)
                        TextField("البريد الإلكتروني", text: $candidateEmail)
                            .keyboardType(.emailAddress)
                    }
                }

                Section("خطاب موافقة / عدم ممانعة الجامعة (internship_letter)") {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Button(action: { isSelectingPdf = true }) {
                                Label("اختر وثيقة PDF لرفعها", systemImage: "doc.badge.plus")
                                    .font(.subheadline.bold())
                                    .foregroundColor(MiranTheme.emerald)
                            }
                            Spacer()
                            if isUploadingPdf {
                                ProgressView()
                                    .scaleEffect(0.8)
                            }
                        }

                        HStack {
                            Text("حالة المرفق:")
                                .font(.caption)
                                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                            Spacer()
                            if isUploadingPdf {
                                Label("جاري الرفع والسكون بالخادم...", systemImage: "arrow.up.circle")
                                    .font(.caption)
                                    .foregroundColor(.blue)
                            } else if !internshipLetterUrl.isEmpty {
                                Label("تم إرفاق خطاب عدم الممانعة", systemImage: "checkmark.seal.fill")
                                    .font(.caption.bold())
                                    .foregroundColor(MiranTheme.emerald)
                            } else {
                                Label("لم يتم إرفاق الخطاب", systemImage: "xmark.circle")
                                    .font(.caption)
                                    .foregroundColor(.red)
                            }
                        }

                        if !uploadedFileName.isEmpty {
                            Text("الملف المرفوع: \(uploadedFileName)")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }

                        if !uploadErrorMsg.isEmpty {
                            Text(uploadErrorMsg)
                                .font(.caption2)
                                .foregroundColor(.red)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section("فترة التدريب العامة") {
                    DatePicker("تاريخ بداية التدريب", selection: $startDate, displayedComponents: .date)
                    DatePicker("تاريخ نهاية التدريب", selection: $endDate, displayedComponents: .date)
                }

                Section("ملاحظات إضافية") {
                    TextField("ملاحظات ومتطلبات إضافية", text: $notes)
                }

                if !errorMsg.isEmpty {
                    Section {
                        Text(errorMsg).foregroundColor(.red).font(.caption)
                    }
                }
            }
            .navigationTitle(requestMode == "batch" ? "استيراد طلب دفعة Excel" : "إدخال متدرب فردي")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isLoading {
                        ProgressView()
                    } else {
                        Button("إرسال واستيراد") { Task { await submitRequest() } }
                            .disabled(isSubmitDisabled)
                    }
                }
            }
            .onAppear {
                if targetHospitalId.isEmpty {
                    targetHospitalId = store.hospitalCards.first?.id ?? ""
                }
            }
            .fileImporter(
                isPresented: $isSelectingPdf,
                allowedContentTypes: [.pdf],
                allowsMultipleSelection: false
            ) { result in
                switch result {
                case .success(let urls):
                    guard let selectedUrl = urls.first else { return }
                    Task { await uploadPdfFile(url: selectedUrl) }
                case .failure(let err):
                    uploadErrorMsg = "تعذر اختيار الملف: \(err.localizedDescription)"
                }
            }
        }
    }

    private func uploadPdfFile(url: URL) async {
        guard url.startAccessingSecurityScopedResource() else {
            uploadErrorMsg = "تعذر الوصول للملف المختار"
            return
        }
        defer { url.stopAccessingSecurityScopedResource() }

        isUploadingPdf = true
        uploadErrorMsg = ""

        do {
            let data = try Data(contentsOf: url)
            let fileName = url.lastPathComponent
            selectedPdfData = data
            uploadedFileName = fileName
            internshipLetterUrl = "pdf_ready:\(fileName)"
        } catch {
            uploadErrorMsg = "فشل قراءة الملف: \(error.localizedDescription)"
        }
        isUploadingPdf = false
    }

    private func parseAndValidateExcelRoster(_ text: String) {
        batchValidationErrors.removeAll()
        parsedBatchRows.removeAll()

        let lines = text.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        if lines.isEmpty { return }

        var count = 0
        for line in lines {
            count += 1
            // Support CSV, Tab-delimited, or JSON-like object text from Excel paste
            let parts = line.components(separatedBy: CharacterSet(charactersIn: ",\t|")).map { $0.trimmingCharacters(in: .whitespaces) }
            if parts.count >= 3 {
                let acad = parts[0]
                let nid = parts[1]
                let name = parts[2]
                let enName = parts.count > 3 ? parts[3] : nil
                let gender = parts.count > 4 ? parts[4] : nil
                let spec = parts.count > 5 ? parts[5] : specialty
                let uni = parts.count > 6 ? parts[6] : nil
                let email = parts.count > 7 ? parts[7] : nil
                let mobile = parts.count > 8 ? parts[8] : nil
                let start = parts.count > 9 ? parts[9] : nil
                let end = parts.count > 10 ? parts[10] : nil

                // Validation rules
                if acad.isEmpty { batchValidationErrors.append("سطر \(count): الرقم الأكاديمي مفقود") }
                if nid.count != 10 || !nid.allSatisfy(\.isNumber) {
                    batchValidationErrors.append("سطر \(count): رقم الهوية (\(nid)) يجب أن يتكون من 10 أرقام")
                }
                if name.isEmpty { batchValidationErrors.append("سطر \(count): الاسم بالعربية مفقود") }

                let row = CandidateTraineeInputDtoHelper(
                    academicNumber: acad,
                    nationalId: nid,
                    nameAr: name,
                    nameEn: enName,
                    gender: gender,
                    specialty: spec.isEmpty ? specialty : spec,
                    university: uni,
                    email: email,
                    mobile: mobile,
                    startDate: start,
                    endDate: end
                )
                parsedBatchRows.append(row)
            }
        }
        studentCountStr = "\(max(1, parsedBatchRows.count))"
    }

    private var isSubmitDisabled: Bool {
        if specialty.trimmingCharacters(in: .whitespaces).isEmpty || targetHospitalId.isEmpty { return true }
        if requestMode == "single" {
            return candidateNameAr.isEmpty || candidateNationalId.isEmpty || candidateAcademicNumber.isEmpty
        } else {
            return (Int(studentCountStr) ?? 0) <= 0
        }
    }

    private func submitRequest() async {
        let count = requestMode == "single" ? 1 : (Int(studentCountStr) ?? 1)
        guard count > 0 else {
            errorMsg = "الرجاء أدخل عدد متدربين صحيح"
            return
        }
        guard !targetHospitalId.isEmpty else {
            errorMsg = "الرجاء اختيار المستشفى المستهدف"
            return
        }

        isLoading = true
        errorMsg = ""

        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"

        struct TraineeInputBody: Encodable {
            let academicNumber: String
            let nationalId: String
            let nameAr: String
            let specialty: String?
            let email: String?
            let mobile: String?
            let startDate: String?
            let endDate: String?
        }

        struct CreateReqBody: Encodable {
            let requestType: String
            let targetOrgId: String
            let targetHospitalId: String
            let specialty: String
            let studentCount: Int
            let trainingStartDate: String
            let trainingEndDate: String
            let notes: String
            let clusterLetterUrl: String?
            let trainees: [TraineeInputBody]?
        }

        var traineesList: [TraineeInputBody]? = nil
        if requestMode == "single" {
            traineesList = [
                TraineeInputBody(
                    academicNumber: candidateAcademicNumber.trimmingCharacters(in: .whitespaces),
                    nationalId: candidateNationalId.trimmingCharacters(in: .whitespaces),
                    nameAr: candidateNameAr.trimmingCharacters(in: .whitespaces),
                    specialty: specialty.trimmingCharacters(in: .whitespaces),
                    email: candidateEmail.isEmpty ? nil : candidateEmail.trimmingCharacters(in: .whitespaces),
                    mobile: candidateMobile.isEmpty ? nil : candidateMobile.trimmingCharacters(in: .whitespaces),
                    startDate: fmt.string(from: startDate),
                    endDate: fmt.string(from: endDate)
                )
            ]
        } else if requestMode == "batch" && !parsedBatchRows.isEmpty {
            traineesList = parsedBatchRows.map { row in
                TraineeInputBody(
                    academicNumber: row.academicNumber,
                    nationalId: row.nationalId,
                    nameAr: row.nameAr,
                    specialty: row.specialty ?? specialty,
                    email: row.email,
                    mobile: row.mobile,
                    startDate: row.startDate ?? fmt.string(from: startDate),
                    endDate: row.endDate ?? fmt.string(from: endDate)
                )
            }
        }

        let body = CreateReqBody(
            requestType: "cluster_request",
            targetOrgId: targetHospitalId,
            targetHospitalId: targetHospitalId,
            specialty: specialty.trimmingCharacters(in: .whitespaces),
            studentCount: count,
            trainingStartDate: fmt.string(from: startDate),
            trainingEndDate: fmt.string(from: endDate),
            notes: notes.isEmpty ? (requestMode == "single" ? "طلب إدخال متدرب فردي مباشر" : "طلب تدريب دفعة عبر استيراد الإكسل") : notes,
            clusterLetterUrl: internshipLetterUrl.isEmpty ? nil : internshipLetterUrl.trimmingCharacters(in: .whitespaces),
            trainees: traineesList
        )

        struct CreateReqResponseData: Decodable {
            let id: String
        }
        struct CreateReqResponseEnvelope: Decodable {
            let data: CreateReqResponseData
        }

        do {
            let resEnv: CreateReqResponseEnvelope = try await APIClient.shared.request(endpoint: "/training-requests", method: "POST", body: body)
            let createdReqId = resEnv.data.id

            // If PDF file was selected, upload TraineeDocument for created trainees so ValidationEngine passes
            if let pdfData = selectedPdfData {
                let traineesRows: APIListResponse<TrainingRequestTraineeRow> = try await APIClient.shared.request(endpoint: "/training-requests/\(createdReqId)/trainees")
                for row in traineesRows.data {
                    _ = try? await APIClient.shared.uploadTraineeDocument(
                        fileData: pdfData,
                        fileName: uploadedFileName.isEmpty ? "internship_letter.pdf" : uploadedFileName,
                        documentType: "internship_letter",
                        trainingRequestTraineeId: row.id,
                        titleAr: "خطاب الامتياز الرسمي",
                        isMandatory: true
                    )
                }
            }

            await store.fetchTrainingRequests()
            dismiss()
        } catch {
            errorMsg = error.localizedDescription
        }
        isLoading = false
    }
}
