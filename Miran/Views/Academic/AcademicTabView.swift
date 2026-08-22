//
//  AcademicTabView.swift
//  Miran
//
//  SwiftUI Academic Tab View connected to Miran REST APIs.
//

import SwiftUI

struct AcademicTabView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var intakes: [AcademicIntakeModel] = []
    @State private var isLoading = false

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background
                    .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // Header
                        VStack(alignment: .leading, spacing: 6) {
                            Text("الشؤون الأكاديمية والاعتماد")
                                .font(.title2.weight(.bold))
                                .foregroundColor(.white)
                            Text("إشراف التجمع الصحي والجامعات على الدفعات ومؤشر الانضباط")
                                .font(.caption)
                                .foregroundColor(MiranTheme.subtext)
                        }
                        .padding(.horizontal)

                        // Intakes Card List
                        VStack(alignment: .leading, spacing: 12) {
                            Text("الدفعات الأكاديمية المعتمدة")
                                .font(.headline.weight(.bold))
                                .foregroundColor(.white)
                                .padding(.horizontal)

                            if isLoading {
                                ProgressView()
                                    .tint(.white)
                                    .frame(maxWidth: .infinity)
                                    .padding()
                            } else if intakes.isEmpty {
                                Text("دفعة أطباء الامتياز 2027 — تجمع الحدود الشمالية")
                                    .font(.subheadline)
                                    .foregroundColor(MiranTheme.subtext)
                                    .padding()
                                    .background(Color.white.opacity(0.04))
                                    .cornerRadius(14)
                                    .padding(.horizontal)
                            } else {
                                ForEach(intakes) { intake in
                                    VStack(alignment: .leading, spacing: 6) {
                                        HStack {
                                            Text(intake.displayName)
                                                .font(.body.weight(.bold))
                                                .foregroundColor(.white)
                                            Spacer()
                                            Text(intake.displayCode)
                                                .font(.caption.monospaced())
                                                .foregroundColor(MiranTheme.emerald)
                                        }
                                        Text("السنة: \(intake.academicYear ?? "") — السعة: \(intake.capacity ?? 0) متدرب")
                                            .font(.caption)
                                            .foregroundColor(MiranTheme.subtext)
                                    }
                                    .padding()
                                    .background(Color.white.opacity(0.04))
                                    .cornerRadius(14)
                                    .padding(.horizontal)
                                }
                            }
                        }
                    }
                    .padding(.vertical)
                }
            }
            .navigationTitle("الشؤون الأكاديمية")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                await fetchIntakes()
            }
        }
    }

    private func fetchIntakes() async {
        isLoading = true
        do {
            let res: APIListResponse<AcademicIntakeModel> = try await APIClient.shared.request(endpoint: "/academic-intakes")
            self.intakes = res.data
        } catch {
            // Handle error silently
        }
        isLoading = false
    }
}
